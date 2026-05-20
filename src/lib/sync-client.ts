import {
  decryptJsonWithPassword,
  encryptProjectSnapshot,
  getSyncSpaceId,
  hashEncryptedPayload,
  type PasswordEncryptedPayload,
  type SyncProjectSnapshot,
} from './sync-crypto';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const TABLE_NAME = 'ezwrite_sync_notes';

export interface SyncSession {
  password: string;
  syncSpaceId: string;
}

export interface RemoteSyncNote {
  sync_space_id: string;
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

function getRestUrl(path: string): string {
  if (!SUPABASE_URL) throw new Error('Missing VITE_SUPABASE_URL');
  return `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${path}`;
}

function getHeaders(extra: Record<string, string> = {}): HeadersInit {
  if (!SUPABASE_ANON_KEY) throw new Error('Missing VITE_SUPABASE_ANON_KEY');
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
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

export async function createSyncSession(password: string): Promise<SyncSession> {
  return {
    password,
    syncSpaceId: await getSyncSpaceId(password),
  };
}

export async function listRemoteSyncNotes(session: SyncSession): Promise<RemoteSyncNote[]> {
  const params = new URLSearchParams({
    select: 'sync_space_id,project_id,encrypted_payload,payload_hash,updated_at,client_updated_at',
    sync_space_id: `eq.${session.syncSpaceId}`,
    order: 'updated_at.desc',
  });
  return requestJson<RemoteSyncNote[]>(
    getRestUrl(`${TABLE_NAME}?${params.toString()}`),
    { method: 'GET', headers: getHeaders() },
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
    sync_space_id: session.syncSpaceId,
    project_id: input.projectId,
    encrypted_payload: encryptedPayload,
    payload_hash: await hashEncryptedPayload(encryptedPayload),
    updated_at: now,
    client_updated_at: input.updatedAt,
  };

  const rows = await requestJson<RemoteSyncNote[]>(
    getRestUrl(`${TABLE_NAME}?on_conflict=sync_space_id,project_id`),
    {
      method: 'POST',
      headers: getHeaders({
        Prefer: 'resolution=merge-duplicates,return=representation',
      }),
      body: JSON.stringify(row),
    },
  );

  return rows[0] ?? row;
}
