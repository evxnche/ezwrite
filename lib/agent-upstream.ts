// Shared logic for the /api/agent endpoint. Used by both the Vercel serverless
// handler (api/agent.ts) and the Vite dev middleware (vite-openrouter-proxy.ts)
// so the agent protocol lives in exactly one place.
//
// Two auth modes:
//   - User-authenticated (Bearer Supabase access token) -> mint a passkey.
//   - Passkey-authenticated (X-EZ-Passkey header or body.passkey) -> read/write
//     the user's canvas via a relay the browser drains.
//
// Writes are NOT applied here. They are enqueued into ezwrite_agent_events and the
// user's open browser tab applies them live, then publishes the canvas back into
// ezwrite_agent_canvas for reads. The service role bypasses RLS for both.

import crypto from 'node:crypto';

export interface AgentEnv {
  supabaseUrl: string;
  serviceRoleKey: string;
  anonKey: string;
  passkeyPepper: string;
}

export interface AgentRequest {
  method: string;
  // Header lookups are case-insensitive; pass a getter.
  header: (name: string) => string | undefined;
  body: unknown;
}

export interface AgentResult {
  status: number;
  body: Record<string, unknown>;
}

// --- passkey words ---------------------------------------------------------
// Short, readable, unambiguous words. Entropy is modest by design (two words +
// two digits); guessing is mitigated by uniqueness, expiry, and rate limiting.
const ADJECTIVES = [
  'amber', 'azure', 'brave', 'brisk', 'calm', 'clever', 'cosmic', 'crimson',
  'dapper', 'eager', 'electric', 'fuzzy', 'gentle', 'golden', 'happy', 'humble',
  'jolly', 'keen', 'lucky', 'lunar', 'mellow', 'merry', 'mighty', 'nimble',
  'noble', 'plucky', 'polar', 'quiet', 'rapid', 'royal', 'rustic', 'sandy',
  'silver', 'sleek', 'snappy', 'solar', 'spry', 'sunny', 'swift', 'tidy',
  'vivid', 'witty', 'zesty', 'bold', 'cozy', 'frosty', 'glossy', 'breezy',
];
const NOUNS = [
  'otter', 'falcon', 'maple', 'comet', 'pebble', 'willow', 'meadow', 'harbor',
  'cedar', 'finch', 'lynx', 'heron', 'cobra', 'panda', 'badger', 'marten',
  'walrus', 'puffin', 'salmon', 'ferret', 'beaver', 'bison', 'cricket', 'dolphin',
  'gecko', 'iguana', 'jaguar', 'koala', 'lemur', 'mongoose', 'newt', 'osprey',
  'quail', 'raven', 'seal', 'tapir', 'urchin', 'viper', 'wombat', 'yak',
  'zebra', 'acorn', 'birch', 'clover', 'dune', 'ember', 'fjord', 'grove',
];

function pick<T>(arr: T[]): T {
  return arr[crypto.randomInt(arr.length)];
}

export function generatePasskey(): string {
  const digits = String(crypto.randomInt(10, 100)); // 10-99, always two digits
  return `${pick(ADJECTIVES)}-${pick(NOUNS)}-${digits}`;
}

// Normalize whatever the agent typed ("Amber Otter 47", "amber_otter_47") to the
// canonical "amber-otter-47" before hashing, so lookups are forgiving.
export function normalizePasskey(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function hashPasskey(passkey: string, pepper: string): string {
  return crypto.createHmac('sha256', pepper).update(normalizePasskey(passkey)).digest('hex');
}

// --- supabase admin REST ---------------------------------------------------
function restUrl(env: AgentEnv, path: string): string {
  return `${env.supabaseUrl.replace(/\/$/, '')}/rest/v1/${path}`;
}

async function adminFetch<T>(
  env: AgentEnv,
  path: string,
  init: RequestInit & { prefer?: string } = {},
): Promise<T> {
  const { prefer, headers, ...rest } = init;
  const res = await fetch(restUrl(env, path), {
    ...rest,
    headers: {
      apikey: env.serviceRoleKey,
      Authorization: `Bearer ${env.serviceRoleKey}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
      ...(headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`supabase ${res.status}: ${text || res.statusText}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

async function verifyUserId(env: AgentEnv, accessToken: string): Promise<string | null> {
  const res = await fetch(`${env.supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
    headers: { apikey: env.anonKey, Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const user = (await res.json()) as { id?: string };
  return user.id ?? null;
}

// --- pairing record --------------------------------------------------------
interface PairingRow {
  id: string;
  user_id: string;
  label: string | null;
  target_project_id: string | null;
  can_manage_projects: boolean;
  revoked: boolean;
  expires_at: string | null;
}

async function findPairing(env: AgentEnv, passkey: string): Promise<PairingRow | null> {
  const hash = hashPasskey(passkey, env.passkeyPepper);
  const params = new URLSearchParams({
    select: 'id,user_id,label,target_project_id,can_manage_projects,revoked,expires_at',
    passkey_hash: `eq.${hash}`,
    limit: '1',
  });
  const rows = await adminFetch<PairingRow[]>(env, `ezwrite_agent_pairings?${params}`, { method: 'GET' });
  return rows[0] ?? null;
}

function pairingActive(p: PairingRow): boolean {
  if (p.revoked) return false;
  if (p.expires_at && new Date(p.expires_at).getTime() < Date.now()) return false;
  return true;
}

// --- op validation ---------------------------------------------------------
const WRITE_OPS = new Set([
  'append', 'set_content', 'insert_lines', 'delete_lines', 'replace_lines', 'add_page',
]);
const PROJECT_OPS = new Set(['create_project', 'rename_project', 'delete_project']);

interface AgentOp {
  type: string;
  projectId?: string;
  projectTitle?: string;
  page?: number;
  text?: string;
  content?: string;
  title?: string;
  start?: number;
  count?: number;
}

function bodyObj(body: unknown): Record<string, unknown> {
  if (typeof body === 'string') {
    try { return JSON.parse(body) as Record<string, unknown>; } catch { return {}; }
  }
  return (body && typeof body === 'object') ? (body as Record<string, unknown>) : {};
}

// --- usage doc -------------------------------------------------------------
function usageDoc(): Record<string, unknown> {
  return {
    service: 'ezwrite agent api',
    how: 'Authenticate with your two-word passkey via the X-EZ-Passkey header (or "passkey" in the JSON body). No username/password needed.',
    endpoint: 'POST /api/agent',
    actions: {
      list_projects: '{ "action": "list_projects" } -> [{ projectId, title }]',
      read: '{ "action": "read", "projectId"?: string } -> { projectId, title, pages }',
      append: '{ "action": "append", "text": string, "projectId"?, "projectTitle"? }',
      set_content: '{ "action": "set_content", "content": string, "page"?: number, "projectId"? }',
      insert_lines: '{ "action": "insert_lines", "text": string, "start"?: number, "projectId"? }',
      delete_lines: '{ "action": "delete_lines", "start": number, "count"?: number, "projectId"? }',
      replace_lines: '{ "action": "replace_lines", "start": number, "count": number, "text": string, "projectId"? }',
      add_page: '{ "action": "add_page", "content"?: string, "projectId"? }',
      create_project: '{ "action": "create_project", "title"?, "content"? }  (needs manage scope)',
      rename_project: '{ "action": "rename_project", "projectId"|"projectTitle", "title": string }  (needs manage scope)',
      delete_project: '{ "action": "delete_project", "projectId"|"projectTitle" }  (needs manage scope)',
    },
    note: 'Writes appear live in the owner\'s open ezwrite tab. If no projectId/projectTitle is given, the project the owner is currently looking at is used.',
  };
}

// --- main handler ----------------------------------------------------------
export async function handleAgentRequest(req: AgentRequest, env: AgentEnv): Promise<AgentResult> {
  if (!env.supabaseUrl || !env.serviceRoleKey || !env.anonKey || !env.passkeyPepper) {
    return { status: 503, body: { error: 'Agent API not configured (missing server env: SUPABASE_SERVICE_ROLE_KEY / AGENT_PASSKEY_PEPPER).' } };
  }

  if (req.method === 'GET') {
    return { status: 200, body: usageDoc() };
  }
  if (req.method !== 'POST') {
    return { status: 405, body: { error: 'Method not allowed' } };
  }

  const body = bodyObj(req.body);
  const action = typeof body.action === 'string' ? body.action : '';

  // --- mint_pairing: user-authenticated ---
  if (action === 'mint_pairing') {
    const auth = req.header('authorization') ?? '';
    const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
    if (!token) return { status: 401, body: { error: 'mint_pairing requires a Bearer access token' } };
    const userId = await verifyUserId(env, token);
    if (!userId) return { status: 401, body: { error: 'Invalid or expired session' } };

    const label = typeof body.label === 'string' && body.label.trim() ? body.label.trim().slice(0, 60) : null;
    const targetProjectId = typeof body.targetProjectId === 'string' && body.targetProjectId
      ? body.targetProjectId : null;
    const canManageProjects = body.canManageProjects === true;
    const expiresInMinutes = typeof body.expiresInMinutes === 'number' && body.expiresInMinutes > 0
      ? Math.min(body.expiresInMinutes, 60 * 24 * 30) : null;
    const expiresAt = expiresInMinutes ? new Date(Date.now() + expiresInMinutes * 60_000).toISOString() : null;

    // Retry on the (rare) unique-hash collision.
    for (let attempt = 0; attempt < 5; attempt++) {
      const passkey = generatePasskey();
      const row = {
        user_id: userId,
        passkey_hash: hashPasskey(passkey, env.passkeyPepper),
        label,
        target_project_id: targetProjectId,
        can_manage_projects: canManageProjects,
        expires_at: expiresAt,
      };
      try {
        const inserted = await adminFetch<Array<{ id: string }>>(env, 'ezwrite_agent_pairings', {
          method: 'POST',
          prefer: 'return=representation',
          body: JSON.stringify(row),
        });
        return {
          status: 200,
          body: {
            passkey,
            pairing: {
              id: inserted[0]?.id,
              label,
              targetProjectId,
              canManageProjects,
              expiresAt,
            },
          },
        };
      } catch (err) {
        if (err instanceof Error && /409|duplicate|unique/i.test(err.message)) continue;
        throw err;
      }
    }
    return { status: 500, body: { error: 'Could not generate a unique passkey, try again' } };
  }

  // --- everything else: passkey-authenticated ---
  const passkeyRaw = req.header('x-ez-passkey') ?? (typeof body.passkey === 'string' ? body.passkey : '');
  if (!passkeyRaw) {
    return { status: 401, body: { error: 'Missing passkey. Send it in the X-EZ-Passkey header or as "passkey".' } };
  }
  const pairing = await findPairing(env, passkeyRaw);
  if (!pairing || !pairingActive(pairing)) {
    return { status: 401, body: { error: 'Invalid, revoked, or expired passkey' } };
  }
  void adminFetch(env, `ezwrite_agent_pairings?id=eq.${pairing.id}`, {
    method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify({ last_used_at: new Date().toISOString() }),
  }).catch(() => { /* best effort */ });

  // Reads come straight from the published snapshots.
  if (action === 'list_projects') {
    const params = new URLSearchParams({ select: 'project_id,title,updated_at', user_id: `eq.${pairing.user_id}`, order: 'updated_at.desc' });
    if (pairing.target_project_id) params.set('project_id', `eq.${pairing.target_project_id}`);
    const rows = await adminFetch<Array<{ project_id: string; title: string | null }>>(env, `ezwrite_agent_canvas?${params}`, { method: 'GET' });
    return { status: 200, body: { projects: rows.map((r) => ({ projectId: r.project_id, title: r.title ?? 'untitled' })) } };
  }

  if (action === 'read') {
    const projectId = typeof body.projectId === 'string' && body.projectId ? body.projectId : pairing.target_project_id;
    const params = new URLSearchParams({ select: 'project_id,title,pages,updated_at', user_id: `eq.${pairing.user_id}`, order: 'updated_at.desc', limit: '1' });
    if (projectId) params.set('project_id', `eq.${projectId}`);
    const rows = await adminFetch<Array<{ project_id: string; title: string | null; pages: string[] }>>(env, `ezwrite_agent_canvas?${params}`, { method: 'GET' });
    const row = rows[0];
    if (!row) return { status: 404, body: { error: 'No canvas snapshot yet. Make sure the owner has ezwrite open.' } };
    return { status: 200, body: { projectId: row.project_id, title: row.title ?? 'untitled', pages: row.pages } };
  }

  // Writes enqueue an op for the browser to apply.
  if (WRITE_OPS.has(action) || PROJECT_OPS.has(action)) {
    if (PROJECT_OPS.has(action) && !pairing.can_manage_projects) {
      return { status: 403, body: { error: `This passkey can't manage projects (${action} denied).` } };
    }
    const op: AgentOp = { type: action };
    // Scope: single-project pairings force the target.
    if (pairing.target_project_id) op.projectId = pairing.target_project_id;
    else if (typeof body.projectId === 'string' && body.projectId) op.projectId = body.projectId;
    if (typeof body.projectTitle === 'string') op.projectTitle = body.projectTitle;
    if (typeof body.page === 'number') op.page = body.page;
    if (typeof body.text === 'string') op.text = body.text;
    if (typeof body.content === 'string') op.content = body.content;
    if (typeof body.title === 'string') op.title = body.title;
    if (typeof body.start === 'number') op.start = body.start;
    if (typeof body.count === 'number') op.count = body.count;

    await adminFetch(env, 'ezwrite_agent_events', {
      method: 'POST', prefer: 'return=minimal',
      body: JSON.stringify({ user_id: pairing.user_id, pairing_id: pairing.id, op }),
    });
    return { status: 200, body: { ok: true, queued: true, op: op.type } };
  }

  return { status: 400, body: { error: `Unknown action "${action}". GET /api/agent for usage.` } };
}
