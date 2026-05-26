// Persists the sync session (including the non-extractable masterKey CryptoKey) in
// IndexedDB so a sign-in survives page reloads. localStorage can't hold a CryptoKey;
// IndexedDB structured-clones it and keeps it non-extractable (scripts can't read the
// raw key bytes back out). All operations are best-effort — a storage failure must
// never break sign-in or sync.
import type { SyncSession } from './sync-client';

const DB_NAME = 'ezwrite-sync-session';
const STORE = 'session';
const KEY = 'current';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveSyncSession(session: SyncSession): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(session, KEY);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch {
    // best-effort
  }
}

export async function loadSyncSession(): Promise<SyncSession | null> {
  try {
    const db = await openDB();
    return await new Promise<SyncSession | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => { db.close(); resolve((req.result as SyncSession) ?? null); };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  } catch {
    return null;
  }
}

export async function clearSyncSession(): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch {
    // ignore
  }
}
