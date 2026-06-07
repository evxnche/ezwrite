// File System Access API — persistent local file storage
// Falls back to localStorage-only on unsupported platforms (iOS Safari, Firefox)

import { contentToMarkdown, scratchpadTextToContent } from '@/components/writing-helpers';
import { loadImage } from '@/lib/imageStore';
import { loadVoice, voiceMimeToExt } from '@/lib/voiceStore';

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
  return `${String(index + 1).padStart(3, '0')}.md`;
}

function getProjectTitleFromMarkdown(markdowns: string[]): string {
  const first = markdowns[0] ?? '';
  for (const line of first.split('\n')) {
    const clean = line.replace(/\u00A0/g, ' ').trim();
    if (clean) return clean.replace(/^#+\s*/, '').replace(/^>\s*/, '').replace(/^\*\*|\*\*$/g, '').trim().slice(0, 120);
  }
  return 'untitled';
}

function mimeToExt(mime: string): string {
  switch (mime) {
    case 'image/jpeg': return 'jpg';
    case 'image/png': return 'png';
    case 'image/webp': return 'webp';
    case 'image/gif': return 'gif';
    default: return 'img';
  }
}

interface ProjectImage {
  id: string;
  fileName: string;
  blob: Blob;
}

// Scan content for polaroid::<id> refs, load each image's data URL from localStorage,
// and turn it into a writable Blob + stable file name (images/<id>.<ext>).
async function collectImages(contents: string[]): Promise<ProjectImage[]> {
  const ids = new Set<string>();
  for (const c of contents) {
    if (!c) continue;
    for (const line of c.split('\n')) {
      const m = line.match(/^polaroid::([^|]+)/);
      if (m) ids.add(m[1]);
    }
  }
  const result: ProjectImage[] = [];
  for (const id of ids) {
    const dataUrl = loadImage(id);
    if (!dataUrl) continue;
    try {
      const blob = await (await fetch(dataUrl)).blob();
      result.push({ id, fileName: `${id}.${mimeToExt(blob.type)}`, blob });
    } catch {
      // unreadable image — skip
    }
  }
  return result;
}

interface ProjectVoice {
  id: string;
  fileName: string;
  blob: Blob;
}

async function collectVoices(contents: string[]): Promise<ProjectVoice[]> {
  const ids = new Set<string>();
  for (const c of contents) {
    if (!c) continue;
    for (const line of c.split('\n')) {
      const m = line.match(/^voice::([^|]+)/);
      if (m) ids.add(m[1]);
    }
  }
  const result: ProjectVoice[] = [];
  for (const id of ids) {
    const voice = await loadVoice(id);
    if (!voice) continue;
    result.push({
      id,
      fileName: `${id}.${voiceMimeToExt(voice.mimeType)}`,
      blob: voice.blob,
    });
  }
  return result;
}

async function syncProjectDirectory(
  projectDir: FileSystemDirectoryHandle,
  projectId: string,
  pages: string[],
  scratchpad = '',
  title?: string,
): Promise<void> {
  const scratchpadContent = scratchpad.trim() ? scratchpadTextToContent(scratchpad) : '';
  const allContents = [...pages, scratchpadContent];
  const images = await collectImages(allContents);
  const voices = await collectVoices(allContents);
  const imagePaths = new Map(images.map((im) => [im.id, `images/${im.fileName}`]));
  const voicePaths = new Map(voices.map((voice) => [voice.id, `audio/${voice.fileName}`]));
  const markdownOpts = { wysiwyg: true as const, imagePaths, voicePaths };

  const markdowns = pages.map((page) => contentToMarkdown(page, undefined, markdownOpts));
  const scratchpadMd = scratchpadContent
    ? contentToMarkdown(scratchpadContent, undefined, markdownOpts)
    : '';

  const expectedNames = new Set<string>(['project.json']);

  await Promise.all(markdowns.map(async (md, i) => {
    const fileName = getPageFileName(i);
    expectedNames.add(fileName);
    const fileHandle = await projectDir.getFileHandle(fileName, { create: true });
    const writable = await (fileHandle as FileSystemFileHandle & WritableHandle).createWritable();
    await writable.write(md);
    await writable.close();
  }));

  if (scratchpadMd.trim()) {
    expectedNames.add('scratchpad.md');
    const scratchpadHandle = await projectDir.getFileHandle('scratchpad.md', { create: true });
    const scratchpadWritable = await (scratchpadHandle as FileSystemFileHandle & WritableHandle).createWritable();
    await scratchpadWritable.write(scratchpadMd);
    await scratchpadWritable.close();
  }

  // Images referenced by the markdown live in an images/ subfolder.
  if (images.length > 0) {
    const imagesDir = await projectDir.getDirectoryHandle('images', { create: true });
    const expectedImages = new Set<string>();
    await Promise.all(images.map(async (im) => {
      expectedImages.add(im.fileName);
      const fileHandle = await imagesDir.getFileHandle(im.fileName, { create: true });
      const writable = await (fileHandle as FileSystemFileHandle & WritableHandle).createWritable();
      await writable.write(im.blob);
      await writable.close();
    }));
    for await (const [name] of (imagesDir as IterableDirectoryHandle).entries()) {
      if (!expectedImages.has(name)) await imagesDir.removeEntry(name);
    }
  } else {
    try { await projectDir.removeEntry('images', { recursive: true }); } catch { /* no images dir to remove */ }
  }

  if (voices.length > 0) {
    const audioDir = await projectDir.getDirectoryHandle('audio', { create: true });
    const expectedAudio = new Set<string>();
    await Promise.all(voices.map(async (voice) => {
      expectedAudio.add(voice.fileName);
      const fileHandle = await audioDir.getFileHandle(voice.fileName, { create: true });
      const writable = await (fileHandle as FileSystemFileHandle & WritableHandle).createWritable();
      await writable.write(voice.blob);
      await writable.close();
    }));
    for await (const [name] of (audioDir as IterableDirectoryHandle).entries()) {
      if (!expectedAudio.has(name)) await audioDir.removeEntry(name);
    }
  } else {
    try { await projectDir.removeEntry('audio', { recursive: true }); } catch { /* no audio dir to remove */ }
  }

  const metaHandle = await projectDir.getFileHandle('project.json', { create: true });
  const metaWritable = await (metaHandle as FileSystemFileHandle & WritableHandle).createWritable();
  await metaWritable.write(JSON.stringify({
    id: projectId,
    title: getProjectTitleFromMarkdown(markdowns),
    pageCount: markdowns.length,
    hasScratchpad: Boolean(scratchpadMd.trim()),
    updatedAt: Date.now(),
  }, null, 2));
  await metaWritable.close();

  for await (const [name] of (projectDir as IterableDirectoryHandle).entries()) {
    const isLegacyPage = /^ezwrite-\d+\.md$/.test(name);
    const isLegacyPage2 = /^page-\d{3}\.md$/.test(name);
    const isPage = /^\d{3}\.md$/.test(name);
    const isScratchpad = name === 'scratchpad.md';
    if ((isLegacyPage || isLegacyPage2 || isPage || isScratchpad) && !expectedNames.has(name)) {
      await projectDir.removeEntry(name);
    }
  }
}

export const isFileSystemSupported = (): boolean =>
  typeof window !== 'undefined' && 'showDirectoryPicker' in window;

export async function requestPersistentBrowserStorage(): Promise<boolean | null> {
  if (typeof navigator === 'undefined' || !('storage' in navigator)) return null;
  const storage = navigator.storage;
  if (!('persist' in storage)) return null;
  try {
    return await storage.persist();
  } catch {
    return null;
  }
}

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
  pages: string[],
  scratchpad = '',
  title?: string
): Promise<void> {
  try {
    if (dirHandle !== lastGrantedHandle) {
      const permission = await (dirHandle as DirectoryHandleWithPermission).requestPermission?.({ mode: 'readwrite' });
      if (permission && permission !== 'granted') return;
      lastGrantedHandle = dirHandle;
    }
    const folderName = (title?.trim() && title.trim() !== 'untitled') ? title.trim() : projectId;
    const projectDir = await dirHandle.getDirectoryHandle(folderName, { create: true });
    await syncProjectDirectory(projectDir, projectId, pages, scratchpad, title);
  } catch {
    lastGrantedHandle = null;
  }
}

// Legacy wrapper
export async function writePageFiles(
  dirHandle: FileSystemDirectoryHandle,
  pages: string[]
): Promise<void> {
  return writeProjectFiles(dirHandle, 'default', pages);
}

export function getDirName(handle: FileSystemDirectoryHandle | null): string {
  return handle?.name ?? '';
}

interface PendingOPFSWrite {
  pages: string[];
  projectId?: string;
  scratchpad: string;
  title?: string;
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
    const folderName = (pending.title?.trim() && pending.title.trim() !== 'untitled') ? pending.title.trim() : pending.projectId;
    const dir = folderName
      ? await root.getDirectoryHandle(folderName, { create: true })
      : root;
    await syncProjectDirectory(dir, pending.projectId ?? 'default', pending.pages, pending.scratchpad, pending.title);
  } catch {
    // silently fail
  }
}

export async function writeToOPFS(
  pages: string[],
  projectId?: string,
  scratchpad = '',
  options: OPFSWriteOptions = {},
  title?: string,
): Promise<void> {
  if (!('storage' in navigator && 'getDirectory' in navigator.storage)) return;
  opfsPendingWrite = { pages, projectId, scratchpad, title };

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
