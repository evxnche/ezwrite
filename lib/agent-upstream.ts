// Shared logic for the /api/agent endpoint. Used by both the Vercel serverless
// handler (api/agent.ts) and the Vite dev middleware (vite-openrouter-proxy.ts)
// so the agent protocol lives in exactly one place.
//
// Two auth modes:
//   - User-authenticated (Bearer Supabase access token) -> mint a passkey.
//   - Passkey-authenticated (X-EZ-Passkey header or body.passkey) -> read/write
//     the user's canvas.
//
// Writes apply directly to ezwrite_agent_canvas here (service role bypasses RLS),
// so agents work with no browser tab open. The owner's tab two-way-syncs that
// snapshot into its local-first storage (pull-merge with conflict forking, push
// of local edits) — see src/lib/agent-canvas-sync.ts.

import crypto from 'node:crypto';
import { rateLimitAllow, clientIp } from './rate-limit.ts';

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
  // 48 adj × 48 noun × 48 noun × 9000 digits ≈ 1.0 billion combinations — ~4800× the
  // old adj-noun-2digit keyspace (207k), so it isn't brute-forceable even absent a
  // rate limit. Still short enough to hand off by copy-paste.
  const digits = String(crypto.randomInt(1000, 10000)); // 1000-9999, always four digits
  return `${pick(ADJECTIVES)}-${pick(NOUNS)}-${pick(NOUNS)}-${digits}`;
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
  // A successful write with `Prefer: return=minimal` comes back as 201/204 with
  // an empty body. Don't JSON.parse that — it throws "Unexpected end of JSON input".
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
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
// Agents can create and rename docs, but never delete them.
const PROJECT_OPS = new Set(['create_project', 'rename_project']);

function bodyObj(body: unknown): Record<string, unknown> {
  if (typeof body === 'string') {
    try { return JSON.parse(body) as Record<string, unknown>; } catch { return {}; }
  }
  return (body && typeof body === 'object') ? (body as Record<string, unknown>) : {};
}

// --- canvas apply (server-side) --------------------------------------------
// The server applies write ops straight to ezwrite_agent_canvas so agents work
// with NO browser tab open. The browser two-way-syncs that snapshot back into
// its local-first storage. transformPageForAgentOp is the SAME pure transform
// the browser uses, so a page mutates identically on either side.

export interface AgentTextOp {
  type: string;
  text?: string;
  content?: string;
  start?: number;
  count?: number;
}

export function transformPageForAgentOp(cur: string, op: AgentTextOp): string {
  const text = op.text ?? '';
  if (op.type === 'set_content') return op.content ?? '';
  if (op.type === 'append') return cur ? `${cur}\n${text}` : text;
  const lines = cur.split('\n');
  const start = typeof op.start === 'number'
    ? Math.max(0, Math.min(op.start, lines.length))
    : lines.length;
  if (op.type === 'insert_lines') { lines.splice(start, 0, ...text.split('\n')); return lines.join('\n'); }
  if (op.type === 'delete_lines') { lines.splice(start, op.count ?? 1); return lines.join('\n'); }
  if (op.type === 'replace_lines') { lines.splice(start, op.count ?? 1, ...text.split('\n')); return lines.join('\n'); }
  return cur;
}

// Project id in the same shape the browser's generateId() produces.
function newProjectId(): string {
  return Date.now().toString(36) + crypto.randomBytes(5).toString('hex').slice(0, 6);
}

interface CanvasRow {
  project_id: string;
  title: string | null;
  pages: string[];
}

async function fetchCanvasRow(env: AgentEnv, userId: string, projectId: string): Promise<CanvasRow | null> {
  const params = new URLSearchParams({
    select: 'project_id,title,pages',
    user_id: `eq.${userId}`,
    project_id: `eq.${projectId}`,
    limit: '1',
  });
  const rows = await adminFetch<CanvasRow[]>(env, `ezwrite_agent_canvas?${params}`, { method: 'GET' });
  return rows[0] ?? null;
}

// Upsert a canvas row, bumping updated_at so the browser's pull notices the change.
async function writeCanvasRow(env: AgentEnv, userId: string, row: CanvasRow): Promise<void> {
  await adminFetch(env, 'ezwrite_agent_canvas?on_conflict=user_id,project_id', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: JSON.stringify({
      user_id: userId,
      project_id: row.project_id,
      title: row.title,
      pages: row.pages,
      updated_at: new Date().toISOString(),
    }),
  });
}

// Resolve which doc a write targets: explicit id, else loose title match, else the
// most-recently-updated doc (the server has no notion of "currently open").
async function resolveCanvasTarget(env: AgentEnv, pairing: PairingRow, body: Record<string, unknown>): Promise<string | null> {
  if (pairing.target_project_id) return pairing.target_project_id;
  if (typeof body.projectId === 'string' && body.projectId) return body.projectId;

  if (typeof body.projectTitle === 'string' && body.projectTitle.trim()) {
    const wanted = body.projectTitle.trim().toLowerCase();
    const params = new URLSearchParams({ select: 'project_id,title', user_id: `eq.${pairing.user_id}`, order: 'updated_at.desc' });
    const rows = await adminFetch<Array<{ project_id: string; title: string | null }>>(env, `ezwrite_agent_canvas?${params}`, { method: 'GET' });
    const exact = rows.find((r) => (r.title ?? '').toLowerCase() === wanted);
    if (exact) return exact.project_id;
    const contains = rows.find((r) => {
      const t = (r.title ?? '').toLowerCase();
      return t.length > 0 && (t.includes(wanted) || wanted.includes(t));
    });
    return contains?.project_id ?? null;
  }

  const params = new URLSearchParams({ select: 'project_id', user_id: `eq.${pairing.user_id}`, order: 'updated_at.desc', limit: '1' });
  const rows = await adminFetch<Array<{ project_id: string }>>(env, `ezwrite_agent_canvas?${params}`, { method: 'GET' });
  return rows[0]?.project_id ?? null;
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
      create_project: '{ "action": "create_project", "title"?, "content"? }',
      rename_project: '{ "action": "rename_project", "projectId"|"projectTitle", "title": string }',
    },
    note: 'Writes apply immediately to the canvas — no open tab required — and the owner\'s ezwrite syncs them into local storage when it next runs. If no projectId is given, pass projectTitle (matched loosely against the owner\'s doc titles) or omit both to target the most recently updated doc. Agents cannot delete docs.',
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

  // Overall per-IP flood cap on the public POST surface (generous for real agents).
  const ip = clientIp(req.header);
  if (!(await rateLimitAllow(env, `agent:${ip}`, 60, 90))) {
    return { status: 429, body: { error: 'Too many requests. Slow down and retry shortly.' } };
  }

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
        can_manage_projects: true, // agents can create/rename, never delete
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
    // Throttle wrong-passkey guesses per IP so the (now ~1B) keyspace can't be enumerated.
    const within = await rateLimitAllow(env, `agent-fail:${ip}`, 600, 10);
    return within
      ? { status: 401, body: { error: 'Invalid, revoked, or expired passkey' } }
      : { status: 429, body: { error: 'Too many failed attempts. Try again later.' } };
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

  // Agents are never allowed to delete docs.
  if (action === 'delete_project') {
    return { status: 403, body: { error: 'Agents cannot delete docs. Ask the owner to delete it.' } };
  }

  // Writes apply straight to the canvas snapshot — no browser tab required. The
  // owner's tab two-way-syncs the snapshot into its local-first storage when it
  // next runs (pull-merge, with conflict forking).
  if (WRITE_OPS.has(action) || PROJECT_OPS.has(action)) {
    if (action === 'create_project') {
      const projectId = newProjectId();
      const content = typeof body.content === 'string' ? body.content : '';
      const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : null;
      await writeCanvasRow(env, pairing.user_id, { project_id: projectId, title, pages: [content] });
      return { status: 200, body: { ok: true, applied: true, op: action, projectId } };
    }

    const projectId = await resolveCanvasTarget(env, pairing, body);
    if (!projectId) {
      return { status: 404, body: { error: 'No target doc. Pass projectId or projectTitle, or open ezwrite once so a doc exists.' } };
    }

    if (action === 'rename_project') {
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      if (!title) return { status: 400, body: { error: 'rename_project needs a non-empty "title".' } };
      const row = await fetchCanvasRow(env, pairing.user_id, projectId);
      if (!row) return { status: 404, body: { error: 'That doc is not in the canvas yet. Open ezwrite once to publish it.' } };
      await writeCanvasRow(env, pairing.user_id, { project_id: projectId, title, pages: row.pages });
      return { status: 200, body: { ok: true, applied: true, op: action, projectId } };
    }

    // Content ops need the doc's current pages from the snapshot.
    const row = await fetchCanvasRow(env, pairing.user_id, projectId);
    if (!row) return { status: 404, body: { error: 'That doc is not in the canvas yet. Open ezwrite once to publish it.' } };
    const pages = Array.isArray(row.pages) && row.pages.length ? [...row.pages] : [''];

    if (action === 'add_page') {
      pages.push(typeof body.content === 'string' ? body.content : '');
    } else {
      const pageIndex = typeof body.page === 'number' ? Math.max(0, Math.min(body.page, pages.length - 1)) : 0;
      pages[pageIndex] = transformPageForAgentOp(pages[pageIndex] ?? '', {
        type: action,
        text: typeof body.text === 'string' ? body.text : undefined,
        content: typeof body.content === 'string' ? body.content : undefined,
        start: typeof body.start === 'number' ? body.start : undefined,
        count: typeof body.count === 'number' ? body.count : undefined,
      });
    }
    await writeCanvasRow(env, pairing.user_id, { project_id: projectId, title: row.title, pages });
    return { status: 200, body: { ok: true, applied: true, op: action, projectId } };
  }

  return { status: 400, body: { error: `Unknown action "${action}". GET /api/agent for usage.` } };
}
