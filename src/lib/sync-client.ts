import {
  decryptJsonWithPassword,
  encryptProjectSnapshot,
  hashEncryptedPayload,
  type PasswordEncryptedPayload,
  type SyncProjectSnapshot,
} from './sync-crypto';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const NOTES_TABLE = 'ezwrite_user_sync_notes';
const PROFILES_TABLE = 'ezwrite_profiles';

export interface SyncSession {
  accessToken: string;
  email: string;
  plan: 'free' | 'paid';
  password: string;
  userId: string;
}

export interface RemoteSyncNote {
  user_id: string;
  project_id: string;
  encrypted_payload: PasswordEncryptedPayload;
  payload_hash: string;
  updated_at: number;
  client_updated_at: number;
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

async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Sync request failed (${res.status}): ${body || res.statusText}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

interface AuthResponse {
  access_token?: string;
  user?: {
    id?: string;
    email?: string;
  };
}

async function authWithPassword(email: string, password: string, createAccount: boolean): Promise<AuthResponse> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) throw new Error('Email is required');
  if (!password) throw new Error('Password is required');

  const endpoint = createAccount ? 'signup' : 'token?grant_type=password';
  return requestJson<AuthResponse>(
    getAuthUrl(endpoint),
    {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ email: normalizedEmail, password }),
    },
  );
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
  email: string;
  password: string;
  createAccount?: boolean;
}): Promise<SyncSession> {
  const auth = await authWithPassword(input.email, input.password, Boolean(input.createAccount));
  if (!auth.access_token || !auth.user?.id) {
    throw new Error('Check your email, then sign in');
  }
  const email = auth.user.email ?? input.email.trim().toLowerCase();
  return {
    accessToken: auth.access_token,
    email,
    plan: await getSyncPlan(auth.access_token, auth.user.id),
    password: input.password,
    userId: auth.user.id,
  };
}

export async function listRemoteSyncNotes(session: SyncSession): Promise<RemoteSyncNote[]> {
  const params = new URLSearchParams({
    select: 'user_id,project_id,encrypted_payload,payload_hash,updated_at,client_updated_at',
    order: 'updated_at.desc',
  });
  return requestJson<RemoteSyncNote[]>(
    getRestUrl(`${NOTES_TABLE}?${params.toString()}`),
    { method: 'GET', headers: getHeaders(session.accessToken) },
  );
}

export async function decryptRemoteSyncNote(
  row: RemoteSyncNote,
  password: string,
): Promise<SyncProjectSnapshot> {
  return decryptJsonWithPassword<SyncProjectSnapshot>(row.encrypted_payload, password);
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
): Promise<RemoteSyncNote> {
  const encryptedPayload = await encryptProjectSnapshot({
    projectId: input.projectId,
    title: input.title,
    pages: input.pages,
    scratchpad: input.scratchpad,
    updatedAt: input.updatedAt,
  }, session.password);
  const now = Date.now();
  const row = {
    user_id: session.userId,
    project_id: input.projectId,
    encrypted_payload: encryptedPayload,
    payload_hash: await hashEncryptedPayload(encryptedPayload),
    updated_at: now,
    client_updated_at: input.updatedAt,
  };

  const rows = await requestJson<RemoteSyncNote[]>(
    getRestUrl(`${NOTES_TABLE}?on_conflict=user_id,project_id`),
    {
      method: 'POST',
      headers: getHeaders(session.accessToken, {
        Prefer: 'resolution=merge-duplicates,return=representation',
      }),
      body: JSON.stringify(row),
    },
  );

  return rows[0] ?? row;
}
