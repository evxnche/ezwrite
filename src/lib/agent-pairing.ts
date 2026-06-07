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
