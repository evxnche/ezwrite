const DB_NAME = 'ezwrite-voice';
const STORE = 'blobs';

interface VoiceRecord {
  id: string;
  blob: Blob;
  mimeType: string;
  createdAt: number;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Pure helper — scan page/scratchpad text for live voice note ids. */
export function extractVoiceIdsFromContent(allContent: string[]): Set<string> {
  const liveIds = new Set<string>();
  for (const c of allContent) {
    if (!c) continue;
    for (const line of c.split('\n')) {
      const m = line.match(/^voice::([^|]+)/);
      if (m) liveIds.add(m[1]);
    }
  }
  return liveIds;
}

export async function saveVoice(blob: Blob): Promise<string> {
  const id = generateId();
  const mimeType = blob.type || 'audio/webm';
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ id, blob, mimeType, createdAt: Date.now() } satisfies VoiceRecord, id);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch {
    // storage full or unavailable — caller still gets an id; playback will fail gracefully
  }
  return id;
}

export async function loadVoice(id: string): Promise<{ blob: Blob; mimeType: string } | null> {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => {
        db.close();
        const rec = req.result as VoiceRecord | undefined;
        if (!rec?.blob) {
          resolve(null);
          return;
        }
        resolve({
          blob: rec.blob,
          mimeType: rec.mimeType || rec.blob.type || 'audio/webm',
        });
      };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  } catch {
    return null;
  }
}

export async function deleteVoice(id: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch {
    // ignore
  }
}

export async function gcOrphanVoices(allContent: string[]): Promise<void> {
  const liveIds = extractVoiceIdsFromContent(allContent);
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        const id = String(cursor.key);
        if (!liveIds.has(id)) cursor.delete();
        cursor.continue();
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch {
    // ignore
  }
}

export function voiceMimeToExt(mime: string): string {
  if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('wav')) return 'wav';
  return 'webm';
}
