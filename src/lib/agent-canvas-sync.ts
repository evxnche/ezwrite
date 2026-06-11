// Two-way sync between local-first storage and the plaintext agent canvas.
// The server applies agent writes to ezwrite_agent_canvas directly; this is the
// browser half. One pass reconciles the UNION of local docs and canvas rows:
//   - canvas-only doc  -> pulled down (agent created it headless)
//   - local-only doc   -> pushed up   (seeds the canvas so agents can see it)
//   - both, agent edited, owner didn't -> pulled
//   - both, owner edited, agent didn't -> pushed
//   - both edited       -> fork a -conflict- doc, keep local, push local up
// Every decision is by content hash (no clocks) via decideCanvasMerge.

import {
  getProjectMeta,
  getProjectPages,
  getProjectTitle,
  listProjects,
  saveProjectPages,
  saveProjectSnapshot,
  updateProjectMeta,
} from './projects';
import {
  canvasHash,
  decideCanvasMerge,
  getSyncedHash,
  setSyncedHash,
} from './agent-canvas-merge';

export interface CanvasRow {
  project_id: string;
  title: string | null;
  pages: string[];
}

// The active doc's live (possibly-unsaved) pages, so we never overwrite edits the
// owner is mid-typing — they fork instead. Supplied by the editor each tick.
export interface ActiveDocContext {
  activeProjectId: string | null;
  activePages: string[] | null;
}

export interface CanvasPush {
  projectId: string;
  title: string | null;
  pages: string[];
  hash: string;
}

export interface SyncResult {
  touchedIds: string[];   // local docs created or overwritten from the canvas
  conflictIds: string[];  // -conflict- docs forked because both sides changed
  activeTouched: boolean; // the active doc's stored pages changed -> editor needs a refresh
  pushes: CanvasPush[];   // local docs to upsert to the canvas (caller performs the network write)
  deletes: string[];      // canvas rows to delete because the owner deleted the doc locally
}

function normalizePages(value: unknown): string[] {
  return Array.isArray(value) && value.length ? value.map((p) => String(p ?? '')) : [''];
}

// Live editor pages for the active doc (catches unsaved edits), stored pages otherwise.
function currentLocalPages(projectId: string, ctx: ActiveDocContext): string[] {
  if (projectId === ctx.activeProjectId && ctx.activePages) return ctx.activePages;
  return getProjectPages(projectId);
}

function inScope(id: string, scope: Set<string> | 'all'): boolean {
  return scope === 'all' || scope.has(id);
}

// Reconcile the full canvas against full local storage in one pass.
export async function syncCanvas(
  rows: CanvasRow[],
  ctx: ActiveDocContext,
  scope: Set<string> | 'all',
): Promise<SyncResult> {
  const touchedIds: string[] = [];
  const conflictIds: string[] = [];
  const pushes: CanvasPush[] = [];
  const deletes: string[] = [];
  let activeTouched = false;

  const remoteById = new Map<string, CanvasRow>();
  for (const row of rows) if (inScope(row.project_id, scope)) remoteById.set(row.project_id, row);

  // Union of in-scope local doc ids and canvas row ids. -conflict- docs stay local.
  const ids = new Set<string>();
  for (const p of listProjects()) if (inScope(p.id, scope) && !p.id.includes('-conflict-')) ids.add(p.id);
  for (const id of remoteById.keys()) if (!id.includes('-conflict-')) ids.add(id);

  for (const id of ids) {
    const local = getProjectMeta(id);
    const remote = remoteById.get(id) ?? null;
    const synced = getSyncedHash(id);

    const localTitle = local ? (local.title ?? getProjectTitle(id)) : null;
    const localPages = local ? currentLocalPages(id, ctx) : [];
    const localHash = local ? await canvasHash(localTitle, localPages) : '';

    const remotePages = remote ? normalizePages(remote.pages) : [];
    const remoteHash = remote ? await canvasHash(remote.title, remotePages) : '';

    // First contact (no synced hash): compare directly to remote so identical docs
    // don't spuriously fork, but a divergent one is treated as both-changed -> fork.
    const localChanged = local ? (synced != null ? localHash !== synced : (remote ? localHash !== remoteHash : true)) : false;
    const remoteChanged = remote ? (synced != null ? remoteHash !== synced : true) : false;

    const decision = decideCanvasMerge({
      hasLocal: Boolean(local),
      hasRemote: Boolean(remote),
      hadSynced: synced != null,
      localChanged,
      remoteChanged,
      hashesEqual: Boolean(local && remote) && localHash === remoteHash,
    });

    if (decision === 'skip') continue;

    if (decision === 'mark-synced') {
      setSyncedHash(id, remoteHash);
      continue;
    }

    if (decision === 'delete-remote') {
      // Caller deletes the canvas row and clears bookkeeping once it succeeds.
      deletes.push(id);
      continue;
    }

    if (decision === 'push-local') {
      // Defer the network write to the caller; bookkeeping is set once it succeeds.
      pushes.push({ projectId: id, title: local!.title ?? null, pages: localPages, hash: localHash });
      continue;
    }

    if (decision === 'fork-conflict') {
      const conflictId = `${id}-conflict-${Date.now().toString(36)}`;
      saveProjectSnapshot({
        id: conflictId,
        title: `${remote!.title || 'untitled'} conflict`,
        pages: remotePages,
        syncEnabled: false,
      });
      conflictIds.push(conflictId);
      // Keep local as-is and push it up (local wins on the server); the canvas copy
      // is preserved as the -conflict- doc. Bookkeeping is set once the push lands.
      pushes.push({ projectId: id, title: local!.title ?? null, pages: localPages, hash: localHash });
      continue;
    }

    // apply-remote
    if (local) {
      saveProjectPages(id, remotePages);
      if ((local.title ?? '') !== (remote!.title ?? '')) updateProjectMeta(id, { title: remote!.title ?? undefined });
    } else {
      saveProjectSnapshot({ id, title: remote!.title ?? undefined, pages: remotePages });
    }
    setSyncedHash(id, remoteHash);
    touchedIds.push(id);
    if (id === ctx.activeProjectId) activeTouched = true;
  }

  return { touchedIds, conflictIds, activeTouched, pushes, deletes };
}

// Record a successful push so the doc isn't re-pushed until it changes again.
export function markCanvasPushed(projectId: string, hash: string): void {
  setSyncedHash(projectId, hash);
}
