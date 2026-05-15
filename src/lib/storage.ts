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

interface IterableDirectoryHandle extends FileSystemDirectoryHandle {
  entries: () => AsyncIterableIterator<[string, FileSystemHandle]>;
}

function getPageFileName(index: number): string {
  return `page-${String(index + 1).padStart(3, '0')}.md`;
}

function getProjectTitleFromMarkdown(markdowns: string[]): string {
  const first = markdowns[0] ?? '';
  for (const line of first.split('\n')) {
    const clean = line.trim();
    if (clean) return clean.replace(/^#+\s*/, '').replace(/^>\s*/, '').slice(0, 120);
  }
  return 'untitled';
}

async function syncProjectDirectory(
  projectDir: FileSystemDirectoryHandle,
  projectId: string,
  markdowns: string[],
  scratchpad = '',
): Promise<void> {
  const expectedNames = new Set<string>(['project.json']);

  await Promise.all(markdowns.map(async (md, i) => {
    const fileName = getPageFileName(i);
    expectedNames.add(fileName);
    const fileHandle = await projectDir.getFileHandle(fileName, { create: true });
    const writable = await (fileHandle as FileSystemFileHandle & WritableHandle).createWritable();
    await writable.write(md);
    await writable.close();
  }));

  if (scratchpad.trim()) {
    expectedNames.add('scratchpad.md');
    const scratchpadHandle = await projectDir.getFileHandle('scratchpad.md', { create: true });
    const scratchpadWritable = await (scratchpadHandle as FileSystemFileHandle & WritableHandle).createWritable();
    await scratchpadWritable.write(scratchpad);
    await scratchpadWritable.close();
  }

  const metaHandle = await projectDir.getFileHandle('project.json', { create: true });
  const metaWritable = await (metaHandle as FileSystemFileHandle & WritableHandle).createWritable();
  await metaWritable.write(JSON.stringify({
    id: projectId,
    title: getProjectTitleFromMarkdown(markdowns),
    pageCount: markdowns.length,
    hasScratchpad: Boolean(scratchpad.trim()),
    updatedAt: Date.now(),
  }, null, 2));
  await metaWritable.close();

  for await (const [name] of (projectDir as IterableDirectoryHandle).entries()) {
    const isLegacyPage = /^ezwrite-\d+\.md$/.test(name);
    const isPage = /^page-\d{3}\.md$/.test(name);
    const isScratchpad = name === 'scratchpad.md';
    if ((isLegacyPage || isPage || isScratchpad) && !expectedNames.has(name)) {
      await projectDir.removeEntry(name);
    }
  }
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

// Write each project into its own subfolder:
//   <dir>/<projectId>/project.json
//   <dir>/<projectId>/page-001.md, page-002.md, …
let lastGrantedHandle: FileSystemDirectoryHandle | null = null;

export async function writeProjectFiles(
  dirHandle: FileSystemDirectoryHandle,
  projectId: string,
  markdowns: string[],
  scratchpad = ''
): Promise<void> {
  try {
    if (dirHandle !== lastGrantedHandle) {
      const permission = await (dirHandle as DirectoryHandleWithPermission).requestPermission?.({ mode: 'readwrite' });
      if (permission && permission !== 'granted') return;
      lastGrantedHandle = dirHandle;
    }
    const projectDir = await dirHandle.getDirectoryHandle(projectId, { create: true });
    await syncProjectDirectory(projectDir, projectId, markdowns, scratchpad);
  } catch {
    lastGrantedHandle = null;
  }
}

// Legacy wrapper
export async function writePageFiles(
  dirHandle: FileSystemDirectoryHandle,
  markdowns: string[]
): Promise<void> {
  return writeProjectFiles(dirHandle, 'default', markdowns);
}

export function getDirName(handle: FileSystemDirectoryHandle | null): string {
  return handle?.name ?? '';
}

interface PendingOPFSWrite {
  pages: string[];
  projectId?: string;
  scratchpad: string;
}

interface OPFSWriteOptions {
  delay?: number;
}

// Auto-write to Origin Private File System (no user permission needed)
let opfsWriteScheduled = false;
let opfsWriteTimer: ReturnType<typeof setTimeout> | null = null;
let opfsPendingWrite: PendingOPFSWrite | null = null;

async function flushPendingOPFSWrite(): Promise<void> {
  if (!('storage' in navigator && 'getDirectory' in navigator.storage)) return;
  const pending = opfsPendingWrite;
  if (!pending) return;
  opfsPendingWrite = null;
  opfsWriteScheduled = false;
  opfsWriteTimer = null;
  try {
    const root = await navigator.storage.getDirectory();
    const dir = pending.projectId
      ? await root.getDirectoryHandle(pending.projectId, { create: true })
      : root;
    await syncProjectDirectory(dir, pending.projectId ?? 'default', pending.pages, pending.scratchpad);
  } catch {
    // silently fail
  }
}

export async function writeToOPFS(
  pages: string[],
  projectId?: string,
  scratchpad = '',
  options: OPFSWriteOptions = {},
): Promise<void> {
  if (!('storage' in navigator && 'getDirectory' in navigator.storage)) return;
  opfsPendingWrite = { pages: [...pages], projectId, scratchpad };

  const delay = options.delay ?? 500;
  if (delay <= 0) {
    if (opfsWriteTimer) clearTimeout(opfsWriteTimer);
    await flushPendingOPFSWrite();
    return;
  }

  if (opfsWriteScheduled) return;
  opfsWriteScheduled = true;
  opfsWriteTimer = setTimeout(() => {
    void flushPendingOPFSWrite();
  }, delay);
}
