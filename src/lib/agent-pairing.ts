// Client side of agent pairings: mint a passkey (via /api/agent, which holds the
// server pepper) and list/revoke pairings (direct Supabase REST, owner-scoped by RLS).

// Only the access token + user id are needed; a full SyncSession satisfies this.
export interface PairingAuth {
  accessToken: string;
  userId: string;
}

type AgentPairingEnv = {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
};

let agentPairingEnvOverride: AgentPairingEnv | null = null;

const PAIRINGS_TABLE = 'ezwrite_agent_pairings';
export const AGENT_API_ENDPOINT = 'https://ezwrite.xyz/api/agent';
export const AGENT_MCP_ENDPOINT = 'https://ezwrite.xyz/api/mcp';

export interface AgentPairing {
  id: string;
  label: string | null;
  targetProjectId: string | null;
  canManageProjects: boolean;
  revoked: boolean;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
}

export interface MintPairingOptions {
  label?: string;
  targetProjectId?: string | null;
  expiresInMinutes?: number | null;
}

export interface MintedPairing {
  passkey: string;
  pairing: {
    id: string;
    label: string | null;
    targetProjectId: string | null;
    expiresAt: string | null;
  };
}

interface AgentHandoffOptions {
  expiresAt?: string | null;
  label?: string | null;
  passkey: string;
  targetProjectId?: string | null;
  targetProjectTitle?: string | null;
}

export type AgentApiSetupCode =
  | 'ready'
  | 'server-env-missing'
  | 'schema-missing'
  | 'route-missing'
  | 'unavailable'
  | 'unreachable';

export interface AgentApiSetupStatus {
  ready: boolean;
  code: AgentApiSetupCode;
  message: string;
}

const ROUTE_MISSING_MESSAGE =
  'this build does not expose /api/agent. demo shared canvas from `npm run dev` or a deployed server build.';

export function setAgentPairingEnvForTests(env: AgentPairingEnv | null): void {
  agentPairingEnvOverride = env;
}

function getAgentPairingEnv(): AgentPairingEnv {
  if (agentPairingEnvOverride) return agentPairingEnvOverride;
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return {
      VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL as string | undefined,
      VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
    };
  }
  return {};
}

function restHeaders(accessToken: string, extra: Record<string, string> = {}): HeadersInit {
  const { VITE_SUPABASE_ANON_KEY } = getAgentPairingEnv();
  if (!VITE_SUPABASE_ANON_KEY) throw new Error('Missing VITE_SUPABASE_ANON_KEY');
  return {
    apikey: VITE_SUPABASE_ANON_KEY,
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

function restUrl(path: string): string {
  const { VITE_SUPABASE_URL } = getAgentPairingEnv();
  if (!VITE_SUPABASE_URL) throw new Error('Missing VITE_SUPABASE_URL');
  return `${VITE_SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${path}`;
}

function describeScope(targetProjectId?: string | null, targetProjectTitle?: string | null): string {
  if (!targetProjectId) return 'any doc';
  return targetProjectTitle ? `one doc only (${targetProjectTitle})` : 'one doc only';
}

export function buildAgentHandoffInstructions({
  passkey,
  label,
  targetProjectId,
  targetProjectTitle,
  expiresAt,
}: AgentHandoffOptions): string {
  const lines = ['Use ezwrite shared canvas.', ''];
  const isPoke = label?.trim().toLowerCase() === 'poke';
  const notebookScope = describeScope(targetProjectId, targetProjectTitle);
  const notebookHelp = [
    'How ezwrite is organized:',
    '- A notebook is one document in the notebooks list.',
    '- Each notebook can have multiple pages.',
    '- `list_projects` shows notebooks. `projectId` means notebook ID.',
    '- `read` returns that notebook title plus its `pages` array.',
    '- Page numbering is zero-based in API/tool calls: `page: 0` is the first page, `page: 1` is the second page.',
    '- If asked to edit a specific page, read the notebook first, then update the matching page index.',
    '',
  ];
  const browserFirstHelp = [
    'Try this first:',
    '- If you can browse and edit websites directly, first try the hassle-free path: open https://ezwrite.xyz and make the edit there with no extra setup.',
    '- Find the right notebook, open the right page, then make the requested change.',
    '- If you cannot reliably browse the site, cannot keep the edit stable, or cannot figure out the UI, stop and ask the user to set up the integration route below instead of guessing.',
    '',
  ];

  if (label) {
    lines.push('Agent label:', label, '');
  }

  lines.push(isPoke ? 'MCP server URL:' : 'API endpoint:', isPoke ? AGENT_MCP_ENDPOINT : AGENT_API_ENDPOINT, '');
  lines.push('Passkey:', passkey, '');

  if (expiresAt) {
    lines.push('Expires:', expiresAt, '');
  }

  lines.push('Scope:', notebookScope, '');
  if (isPoke) {
    lines.push(
      ...notebookHelp,
      ...browserFirstHelp,
      'Connect it to Poke:',
      '1. Open https://poke.com/integrations/new',
      '2. Name the integration: ezwrite',
      `3. Use MCP server URL: ${AGENT_MCP_ENDPOINT}`,
      `4. Use API key: ${passkey}`,
      '5. Create the integration, then ask Poke to list your ezwrite docs.',
      '',
      'Important:',
      '- When a user says "notebook", they mean a doc. When they say "page", they mean one entry inside that notebook.',
      '- Poke must use the ezwrite MCP integration; its chat agent cannot make arbitrary terminal network calls.',
      '- Agents can read, edit, create, and rename docs.',
      '- Agents cannot delete docs.',
    );
    return lines.join('\n');
  }

  lines.push(
    ...notebookHelp,
    ...browserFirstHelp,
    'How to use it:',
    '- Send POST requests to the endpoint',
    `- Include header: X-EZ-Passkey: ${passkey}`,
    '- Send JSON request bodies',
    '- Start with: {"action":"list_projects"}',
    '- Then use actions like:',
    '  {"action":"read","projectId":"..."}',
    '  {"action":"append","projectId":"...","text":"..."}',
    '  {"action":"set_content","projectId":"...","content":"..."}',
    '',
    'Important:',
    '- Use the API directly; you do not need to browse the website UI',
    '- When a user says "notebook", they mean a doc. When they say "page", they mean one entry inside that notebook.',
    "- Keep the owner's ezwrite tab open for live writes.",
    '- Agents can read, edit, create, and rename docs.',
    '- Agents cannot delete docs.',
    '- If no projectId is given, the API may use the currently open doc.',
  );

  return lines.join('\n');
}

function readErrorText(body: unknown): string {
  if (!body) return '';
  if (typeof body === 'string') return body.trim();
  if (typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string') {
    return (body as { error: string }).error.trim();
  }
  return '';
}

function detectAgentApiFailureCode(status: number, body: unknown, contentType?: string | null): AgentApiSetupCode {
  const error = readErrorText(body);
  if (status === 404 || /text\/html/i.test(contentType ?? '')) return 'route-missing';
  if (/missing server env|SUPABASE_SERVICE_ROLE_KEY|AGENT_PASSKEY_PEPPER/i.test(error)) return 'server-env-missing';
  if (/ezwrite_agent_(pairings|events|canvas)|schema cache|relation .*ezwrite_agent_/i.test(error)) return 'schema-missing';
  return 'unavailable';
}

export function describeAgentApiFailure(status: number, body: unknown, contentType?: string | null): string {
  const code = detectAgentApiFailureCode(status, body, contentType);
  const error = readErrorText(body);
  if (code === 'route-missing') return ROUTE_MISSING_MESSAGE;
  if (code === 'server-env-missing') {
    return 'shared canvas is not set up on this app yet. add SUPABASE_SERVICE_ROLE_KEY and AGENT_PASSKEY_PEPPER to the server env, then restart the dev server or redeploy.';
  }
  if (code === 'schema-missing') {
    return 'shared canvas tables are missing. run docs/supabase-agents.sql in Supabase, then try again.';
  }
  if (/invalid or expired session/i.test(error)) {
    return 'your sync session expired. sign out and back in, then try again.';
  }
  return error || `Could not create passkey (${status})`;
}

async function readApiBody(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => '');
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: text };
  }
}

export async function probeAgentApiSetup(): Promise<AgentApiSetupStatus> {
  try {
    const res = await fetch('/api/agent', { method: 'GET' });
    if (res.ok) return { ready: true, code: 'ready', message: '' };
    const body = await readApiBody(res);
    return {
      ready: false,
      code: detectAgentApiFailureCode(res.status, body, res.headers.get('content-type')),
      message: describeAgentApiFailure(res.status, body, res.headers.get('content-type')),
    };
  } catch {
    return {
      ready: false,
      code: 'unreachable',
      message: 'could not reach /api/agent. make sure the dev server or deployment is running.',
    };
  }
}

export async function mintPairing(session: PairingAuth, opts: MintPairingOptions = {}): Promise<MintedPairing> {
  const res = await fetch('/api/agent', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.accessToken}`,
    },
    body: JSON.stringify({
      action: 'mint_pairing',
      label: opts.label,
      targetProjectId: opts.targetProjectId ?? null,
      expiresInMinutes: opts.expiresInMinutes ?? null,
    }),
  });
  const data = await readApiBody(res);
  if (!res.ok) throw new Error(describeAgentApiFailure(res.status, data, res.headers.get('content-type')));
  return data as unknown as MintedPairing;
}

interface PairingRow {
  id: string;
  label: string | null;
  target_project_id: string | null;
  can_manage_projects: boolean;
  revoked: boolean;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
}

function rowToPairing(row: PairingRow): AgentPairing {
  return {
    id: row.id,
    label: row.label,
    targetProjectId: row.target_project_id,
    canManageProjects: row.can_manage_projects,
    revoked: row.revoked,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    lastUsedAt: row.last_used_at,
  };
}

export async function listPairings(session: PairingAuth): Promise<AgentPairing[]> {
  const params = new URLSearchParams({
    select: 'id,label,target_project_id,can_manage_projects,revoked,created_at,expires_at,last_used_at',
    user_id: `eq.${session.userId}`,
    revoked: 'eq.false',
    order: 'created_at.desc',
  });
  const res = await fetch(restUrl(`${PAIRINGS_TABLE}?${params}`), {
    method: 'GET',
    headers: restHeaders(session.accessToken),
  });
  if (!res.ok) throw new Error(`Could not load pairings (${res.status})`);
  const rows = (await res.json()) as PairingRow[];
  return rows.map(rowToPairing);
}

export async function revokePairing(session: PairingAuth, id: string): Promise<void> {
  const params = new URLSearchParams({ id: `eq.${id}`, user_id: `eq.${session.userId}` });
  const res = await fetch(restUrl(`${PAIRINGS_TABLE}?${params}`), {
    method: 'PATCH',
    headers: restHeaders(session.accessToken, { Prefer: 'return=minimal' }),
    body: JSON.stringify({ revoked: true }),
  });
  if (!res.ok) throw new Error(`Could not revoke passkey (${res.status})`);
}

// Whether any active (non-revoked, non-expired) pairing exists — drives whether
// the browser relay polls at all.
export function hasActivePairing(pairings: AgentPairing[]): boolean {
  const now = Date.now();
  return pairings.some((p) => !p.revoked && (!p.expiresAt || new Date(p.expiresAt).getTime() > now));
}
