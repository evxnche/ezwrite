// Pure merge policy + bookkeeping for two-way syncing the plaintext agent canvas
// (ezwrite_agent_canvas) with local-first storage. This is the data-safety-critical
// core, kept free of projects.ts / Vite deps so it unit-tests under node:test.
//
// The shape mirrors the E2E note sync (applyRemoteSyncRows): per doc we compare a
// local content hash and the remote snapshot against the hash we last reconciled,
// and decide whether to take the remote, keep local, or fork a -conflict- copy.

export type CanvasMergeDecision =
  | 'skip'             // remote unchanged since we last saw it — nothing to do
  | 'sync-bookkeeping' // remote changed but content is already identical — advance cursor only
  | 'apply-remote'     // take the remote pages/title into local
  | 'fork-conflict';   // both sides changed — keep local, fork the remote copy

export interface CanvasMergeInput {
  hasLocal: boolean;      // a local doc with this id exists
  remoteChanged: boolean; // snapshot.updated_at is newer than what we last reconciled
  localChanged: boolean;  // local content hash differs from the last reconciled hash
  hashesEqual: boolean;   // local content hash equals the remote content hash
}

// The whole policy in one place. Order matters: conflict is only possible when the
// remote moved AND local diverged AND they aren't already equal.
export function decideCanvasMerge(i: CanvasMergeInput): CanvasMergeDecision {
  if (!i.hasLocal) return 'apply-remote';        // brand-new doc from the agent
  if (!i.remoteChanged) return 'skip';           // nothing new remotely
  if (i.hashesEqual) return 'sync-bookkeeping';  // converged (e.g. our own echoed push)
  if (i.localChanged) return 'fork-conflict';    // both edited since last sync
  return 'apply-remote';                         // only the remote changed
}

// --- content hash (stable, async via WebCrypto) ----------------------------

export async function canvasHash(title: string | null, pages: string[]): Promise<string> {
  // JSON serialization is unambiguous about page boundaries, so a structural change
  // (e.g. add_page, or a delete that preserves the concatenation) still moves the
  // hash. A plain join('') would miss it and the sync would silently drop it.
  const payload = JSON.stringify([title ?? '', pages]);
  const bytes = new TextEncoder().encode(payload);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

// --- bookkeeping store (localStorage) --------------------------------------

const CURSOR_PREFIX = 'ezwrite-agent-canvas-cursor-';
const DOCS_KEY = 'ezwrite-agent-canvas-docs';

export interface DocSyncEntry {
  remoteUpdatedAt: number; // ms; snapshot.updated_at we last reconciled for this doc
  syncedHash: string;      // content hash at that reconcile point
}

export function getCanvasCursor(userId: string): number {
  return Number(localStorage.getItem(CURSOR_PREFIX + userId) ?? '0') || 0;
}

export function setCanvasCursor(userId: string, ms: number): void {
  localStorage.setItem(CURSOR_PREFIX + userId, String(ms));
}

function loadDocs(): Record<string, DocSyncEntry> {
  try {
    const raw = localStorage.getItem(DOCS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function getDocSync(projectId: string): DocSyncEntry | null {
  return loadDocs()[projectId] ?? null;
}

export function setDocSync(projectId: string, entry: DocSyncEntry): void {
  const docs = loadDocs();
  docs[projectId] = entry;
  localStorage.setItem(DOCS_KEY, JSON.stringify(docs));
}

export function clearDocSync(projectId: string): void {
  const docs = loadDocs();
  if (projectId in docs) {
    delete docs[projectId];
    localStorage.setItem(DOCS_KEY, JSON.stringify(docs));
  }
}
