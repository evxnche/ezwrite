// Client side of agent pairings: mint a passkey (via /api/agent, which holds the
// server pepper) and list/revoke pairings (direct Supabase REST, owner-scoped by RLS).

// Only the access token + user id are needed; a full SyncSession satisfies this.
export interface PairingAuth {
  accessToken: string;
  userId: string;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
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

function restHeaders(accessToken: string, extra: Record<string, string> = {}): HeadersInit {
  if (!SUPABASE_ANON_KEY) throw new Error('Missing VITE_SUPABASE_ANON_KEY');
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

function restUrl(path: string): string {
  if (!SUPABASE_URL) throw new Error('Missing VITE_SUPABASE_URL');
  return `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${path}`;
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
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error((data.error as string) || `Could not create passkey (${res.status})`);
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
