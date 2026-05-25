import {
  buildSyncProjectSnapshot,
  decryptSnapshotWithKey,
  deriveAuthSecret,
  deriveMasterKey,
  encryptSnapshotWithKey,
  hashSnapshot,
  normalizeUsername,
  type EncryptedNotePayload,
  type SyncProjectSnapshot,
} from './sync-crypto';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const NOTES_TABLE = 'ezwrite_user_sync_notes';
const PROFILES_TABLE = 'ezwrite_profiles';

// Usernames are mapped to a non-routable synthetic email so Supabase's
// email/password auth can be reused without collecting a real address.
const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;
const SYNTHETIC_EMAIL_DOMAIN = 'ezwrite.local';

export interface SyncSession {
  accessToken: string;
  refreshToken: string;
  username: string;
  plan: 'free' | 'paid';
  masterKey: CryptoKey;
  userId: string;
}

export interface RemoteSyncNote {
  user_id: string;
  project_id: string;
  encrypted_payload: EncryptedNotePayload;
  payload_hash: string;
  updated_at: number;
  client_updated_at: number;
  deleted: boolean;
}

export type SyncConfigStatus = 'ready' | 'missing-env';

export function getSyncConfigStatus(): SyncConfigStatus {
  return SUPABASE_URL && SUPABASE_ANON_KEY ? 'ready' : 'missing-env';
}

function getAuthUrl(path: string): string {
  if (!SUPABASE_URL) throw new Error('Missing VITE_SUPABASE_URL');
  return `${SUPABASE_URL.replace(/\/$/, '')}/auth/v1/${path}`;
}

function getRestUrl(path: string): string {
  if (!SUPABASE_URL) throw new Error('Missing VITE_SUPABASE_URL');
  return `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${path}`;
}

function getHeaders(accessToken?: string, extra: Record<string, string> = {}): HeadersInit {
  if (!SUPABASE_ANON_KEY) throw new Error('Missing VITE_SUPABASE_ANON_KEY');
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${accessToken ?? SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function readJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Sync request failed (${res.status}): ${body || res.statusText}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  return readJson<T>(await fetch(url, init));
}

interface AuthResponse {
  access_token?: string;
  refresh_token?: string;
  user?: {
    id?: string;
    email?: string;
  };
}

function usernameToEmail(username: string): string {
  return `${normalizeUsername(username)}@${SYNTHETIC_EMAIL_DOMAIN}`;
}

async function authWithCredentials(email: string, password: string, createAccount: boolean): Promise<AuthResponse> {
  const endpoint = createAccount ? 'signup' : 'token?grant_type=password';
  return requestJson<AuthResponse>(
    getAuthUrl(endpoint),
    {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ email, password }),
    },
  );
}

// Refreshes an expired access token in place so long-lived sessions keep working.
async function refreshSession(session: SyncSession): Promise<void> {
  const auth = await requestJson<AuthResponse>(
    getAuthUrl('token?grant_type=refresh_token'),
    {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ refresh_token: session.refreshToken }),
    },
  );
  if (!auth.access_token) throw new Error('Session expired, sign in again');
  session.accessToken = auth.access_token;
  if (auth.refresh_token) session.refreshToken = auth.refresh_token;
}

// Authenticated REST call that transparently refreshes once on a 401.
async function authedJson<T>(
  session: SyncSession,
  url: string,
  makeInit: (token: string) => RequestInit,
): Promise<T> {
  let res = await fetch(url, makeInit(session.accessToken));
  if (res.status === 401 && session.refreshToken) {
    await refreshSession(session);
    res = await fetch(url, makeInit(session.accessToken));
  }
  return readJson<T>(res);
}

async function getSyncPlan(accessToken: string, userId: string): Promise<'free' | 'paid'> {
  const params = new URLSearchParams({
    select: 'sync_plan',
    id: `eq.${userId}`,
    limit: '1',
  });
  const rows = await requestJson<Array<{ sync_plan?: string }>>(
    getRestUrl(`${PROFILES_TABLE}?${params.toString()}`),
    { method: 'GET', headers: getHeaders(accessToken) },
  );
  return rows[0]?.sync_plan === 'paid' ? 'paid' : 'free';
}

export async function createSyncSession(input: {
  username: string;
  password: string;
  createAccount?: boolean;
}): Promise<SyncSession> {
  const username = normalizeUsername(input.username);
  if (!USERNAME_RE.test(username)) {
    throw new Error('Username: 3-32 chars (letters, numbers, . _ -)');
  }
  if (!input.password) throw new Error('Password is required');

  const authSecret = await deriveAuthSecret(input.password, username);
  const auth = await authWithCredentials(usernameToEmail(username), authSecret, Boolean(input.createAccount));
  if (!auth.access_token || !auth.user?.id) {
    throw new Error('Check your username and password, then try again');
  }
  const masterKey = await deriveMasterKey(input.password, username);
  return {
    accessToken: auth.access_token,
    refreshToken: auth.refresh_token ?? '',
    username,
    plan: await getSyncPlan(auth.access_token, auth.user.id),
    masterKey,
    userId: auth.user.id,
  };
}

// Pulls remote rows. Pass `since` (max updated_at already applied) to fetch only
// rows changed since the last sync; omit it for a full pull.
export async function listRemoteSyncNotes(session: SyncSession, since?: number): Promise<RemoteSyncNote[]> {
  const params = new URLSearchParams({
    select: 'user_id,project_id,encrypted_payload,payload_hash,updated_at,client_updated_at,deleted',
    order: 'updated_at.asc',
  });
  if (since && since > 0) params.set('updated_at', `gt.${since}`);
  return authedJson<RemoteSyncNote[]>(
    session,
    getRestUrl(`${NOTES_TABLE}?${params.toString()}`),
    (token) => ({ method: 'GET', headers: getHeaders(token) }),
  );
}

export async function decryptRemoteSyncNote(
  row: RemoteSyncNote,
  session: SyncSession,
): Promise<SyncProjectSnapshot> {
  return decryptSnapshotWithKey<SyncProjectSnapshot>(row.encrypted_payload, session.masterKey);
}

export async function upsertRemoteSyncNote(
  session: SyncSession,
  input: {
    projectId: string;
    title: string;
    pages: string[];
    scratchpad?: string;
    updatedAt: number;
  },
  opts: { keepalive?: boolean } = {},
): Promise<RemoteSyncNote> {
  const snapshot = buildSyncProjectSnapshot({
    projectId: input.projectId,
    title: input.title,
    pages: input.pages,
    scratchpad: input.scratchpad,
    updatedAt: input.updatedAt,
  });
  const encryptedPayload = await encryptSnapshotWithKey(snapshot, session.masterKey);
  const row = {
    user_id: session.userId,
    project_id: input.projectId,
    encrypted_payload: encryptedPayload,
    payload_hash: await hashSnapshot(snapshot),
    client_updated_at: input.updatedAt,
    deleted: false,
  };

  const rows = await authedJson<RemoteSyncNote[]>(
    session,
    getRestUrl(`${NOTES_TABLE}?on_conflict=user_id,project_id`),
    (token) => ({
      method: 'POST',
      headers: getHeaders(token, {
        Prefer: 'resolution=merge-duplicates,return=representation',
      }),
      body: JSON.stringify(row),
      keepalive: opts.keepalive,
    }),
  );

  return rows[0] ?? { ...row, updated_at: input.updatedAt };
}

// Soft-deletes a remote note (tombstone) so other devices learn of the deletion
// instead of resurrecting the project on their next pull.
export async function deleteRemoteSyncNote(
  session: SyncSession,
  projectId: string,
  opts: { keepalive?: boolean } = {},
): Promise<void> {
  const params = new URLSearchParams({
    user_id: `eq.${session.userId}`,
    project_id: `eq.${projectId}`,
  });
  await authedJson<void>(
    session,
    getRestUrl(`${NOTES_TABLE}?${params.toString()}`),
    (token) => ({
      method: 'PATCH',
      headers: getHeaders(token, { Prefer: 'return=minimal' }),
      body: JSON.stringify({ deleted: true, client_updated_at: Date.now() }),
      keepalive: opts.keepalive,
    }),
  );
}
