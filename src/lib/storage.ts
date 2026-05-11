// File System Access API — persistent local file storage
// Falls back to localStorage-only on unsupported platforms (iOS Safari, Firefox)

const IDB_DB = 'ezwrite-storage';
const IDB_STORE = 'handles';
const IDB_KEY = 'saveDir';

interface WindowWithDirectoryPicker extends Window {
  showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
}

interface DirectoryHandleWithPermission extends FileSystemDirectoryHandle {
  requestPermission?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
}

interface WritableHandle {
  createWritable: () => Promise<FileSystemWritableFileStream>;
}

export const isFileSystemSupported = (): boolean =>
  typeof window !== 'undefined' && 'showDirectoryPicker' in window;

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getSavedHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => { db.close(); resolve(req.result ?? null); };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  } catch {
    return null;
  }
}

export async function saveHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const req = tx.objectStore(IDB_STORE).put(handle, IDB_KEY);
    req.onsuccess = () => { db.close(); resolve(); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

export async function clearHandle(): Promise<void> {
  try {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const req = tx.objectStore(IDB_STORE).delete(IDB_KEY);
      req.onsuccess = () => { db.close(); resolve(); };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  } catch {
    // ignore
  }
}

export async function pickSaveDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (!isFileSystemSupported()) return null;
  try {
    const handle = await (window as WindowWithDirectoryPicker).showDirectoryPicker?.({ mode: 'readwrite' });
    if (!handle) return null;
    await saveHandle(handle);
    return handle;
  } catch {
    return null;
  }
}

// Write each page as a separate markdown file: ezwrite-1.md through ezwrite-5.md
// markdowns: array of pre-converted markdown strings (one per page)
let lastGrantedHandle: FileSystemDirectoryHandle | null = null;

export async function writePageFiles(
  dirHandle: FileSystemDirectoryHandle,
  markdowns: string[]
): Promise<void> {
  try {
    // Only request permission if handle changed or not yet granted
    if (dirHandle !== lastGrantedHandle) {
      const permission = await (dirHandle as DirectoryHandleWithPermission).requestPermission?.({ mode: 'readwrite' });
      if (permission && permission !== 'granted') return;
      lastGrantedHandle = dirHandle;
    }
    await Promise.all(markdowns.map(async (md, i) => {
      const fileName = `ezwrite-${i + 1}.md`;
      const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
      const writable = await (fileHandle as FileSystemFileHandle & WritableHandle).createWritable();
      await writable.write(md);
      await writable.close();
    }));
  } catch {
    lastGrantedHandle = null; // reset on error
    // silently fail — localStorage is always the primary store
  }
}

export function getDirName(handle: FileSystemDirectoryHandle | null): string {
  return handle?.name ?? '';
}

// Auto-write to Origin Private File System (no user permission needed)
let opfsWriteScheduled = false;
export async function writeToOPFS(pages: string[]): Promise<void> {
  if (!('storage' in navigator && 'getDirectory' in navigator.storage)) return;
  if (opfsWriteScheduled) return;
  opfsWriteScheduled = true;
  // Debounce: don't flood the OPFS with writes on every keystroke
  setTimeout(async () => {
    opfsWriteScheduled = false;
    try {
      const root = await navigator.storage.getDirectory();
      await Promise.all(pages.map(async (page, i) => {
        const fh = await root.getFileHandle(`ezwrite-${i + 1}.md`, { create: true });
        const w = await (fh as FileSystemFileHandle & WritableHandle).createWritable();
        await w.write(page);
        await w.close();
      }));
    } catch {
      // silently fail
    }
  }, 500);
}
