// Pure merge policy + bookkeeping for two-way syncing the plaintext agent canvas
// (ezwrite_agent_canvas) with local-first storage. Data-safety-critical core, kept
// free of projects.ts / Vite deps so it unit-tests under node:test.
//
// Change detection is by CONTENT HASH, never by timestamp. An earlier version used
// an updated_at cursor, but the browser stamps its pushes with the browser clock
// while the server stamps agent writes with the server clock — any skew made the
// cursor skip agent edits. We compare each side's current hash against the hash we
// last reconciled (S), so the two clocks never matter.

export type CanvasMergeDecision =
  | 'skip'           // nothing to do
  | 'mark-synced'    // content already agrees — just record the synced hash
  | 'apply-remote'   // take the canvas pages/title into local
  | 'push-local'     // send local up to the canvas (incl. seeding a doc the canvas lacks)
  | 'fork-conflict'  // both sides changed — keep local, fork the canvas copy, then push local
  | 'delete-remote'; // owner deleted a doc we'd synced — remove it from the canvas

export interface CanvasMergeInput {
  hasLocal: boolean;
  hasRemote: boolean;     // a canvas row exists for this doc
  hadSynced: boolean;     // we have a recorded synced hash (i.e. we knew this doc before)
  localChanged: boolean;  // local hash differs from the last synced hash (S)
  remoteChanged: boolean; // canvas hash differs from S
  hashesEqual: boolean;   // local hash equals canvas hash (only meaningful if both exist)
}

export function decideCanvasMerge(i: CanvasMergeInput): CanvasMergeDecision {
  if (!i.hasLocal && !i.hasRemote) return 'skip';
  if (!i.hasLocal) {
    // Canvas-only. If we never knew it, the agent just created it -> pull it down.
    // If we DID sync it before, the owner deleted it locally -> honor that and remove
    // it from the canvas, UNLESS the agent edited it since (then resurrect, don't lose
    // the agent's work — the owner can delete again).
    if (!i.hadSynced) return 'apply-remote';
    return i.remoteChanged ? 'apply-remote' : 'delete-remote';
  }
  if (!i.hasRemote) return 'push-local';       // local-only  -> seed it up to the canvas
  if (i.hashesEqual) return i.remoteChanged || i.localChanged ? 'mark-synced' : 'skip';
  if (i.remoteChanged && i.localChanged) return 'fork-conflict';
  if (i.remoteChanged) return 'apply-remote';
  return 'push-local';                          // only local changed
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

// --- bookkeeping: the last-reconciled content hash per doc -----------------

const HASHES_KEY = 'ezwrite-agent-canvas-synced';

function loadHashes(): Record<string, string> {
  try {
    const raw = localStorage.getItem(HASHES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function getSyncedHash(projectId: string): string | null {
  return loadHashes()[projectId] ?? null;
}

export function setSyncedHash(projectId: string, hash: string): void {
  const all = loadHashes();
  all[projectId] = hash;
  localStorage.setItem(HASHES_KEY, JSON.stringify(all));
}

export function clearSyncedHash(projectId: string): void {
  const all = loadHashes();
  if (projectId in all) {
    delete all[projectId];
    localStorage.setItem(HASHES_KEY, JSON.stringify(all));
  }
}
