// Two-way sync between local-first storage and the plaintext agent canvas.
// The server now applies agent writes to ezwrite_agent_canvas directly; this is
// the browser half that pulls those changes into local storage (forking a
// -conflict- doc when the owner also edited) and pushes the owner's local edits
// back up. All overwrite/fork/skip decisions go through decideCanvasMerge, which
// is unit-tested in agent-canvas-merge.ts.

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
  getDocSync,
  setDocSync,
} from './agent-canvas-merge';

export interface CanvasRow {
  project_id: string;
  title: string | null;
  pages: string[];
  updated_at: string;
}

// The active doc's live (possibly-unsaved) pages, so we never overwrite edits the
// owner is mid-typing — they fork instead. Supplied by the editor each tick.
export interface ActiveDocContext {
  activeProjectId: string | null;
  activePages: string[] | null;
}

export interface ReconcileResult {
  touchedIds: string[];   // local docs created or overwritten from the canvas
  conflictIds: string[];  // -conflict- docs forked because both sides changed
  activeTouched: boolean; // the active doc's stored pages changed → editor needs a refresh
  maxUpdatedAt: number;   // newest snapshot updated_at seen (advance the pull cursor to this)
}

export interface CanvasPush {
  projectId: string;
  title: string | null;
  pages: string[];
  hash: string;
}

function normalizePages(value: unknown): string[] {
  return Array.isArray(value) && value.length ? value.map((p) => String(p ?? '')) : [''];
}

// Current local content for change detection — live editor pages for the active
// doc (catches unsaved edits), stored pages otherwise.
function currentLocalPages(projectId: string, ctx: ActiveDocContext): string[] {
  if (projectId === ctx.activeProjectId && ctx.activePages) return ctx.activePages;
  return getProjectPages(projectId);
}

// PULL: merge remote canvas rows into local storage.
export async function reconcileCanvasRows(rows: CanvasRow[], ctx: ActiveDocContext): Promise<ReconcileResult> {
  const touchedIds: string[] = [];
  const conflictIds: string[] = [];
  let activeTouched = false;
  let maxUpdatedAt = 0;

  for (const row of rows) {
    const projectId = row.project_id;
    const remoteUpdatedAt = Date.parse(row.updated_at) || 0;
    maxUpdatedAt = Math.max(maxUpdatedAt, remoteUpdatedAt);

    const local = getProjectMeta(projectId);
    const docSync = getDocSync(projectId);
    const remotePages = normalizePages(row.pages);
    const remoteHash = await canvasHash(row.title, remotePages);

    const localTitle = local ? (local.title ?? getProjectTitle(projectId)) : null;
    const localPages = local ? currentLocalPages(projectId, ctx) : [];
    const localHash = local ? await canvasHash(localTitle, localPages) : '';

    // localChanged: when we have bookkeeping, compare to the last synced hash. On
    // first contact (no bookkeeping) we can't prove local is unchanged, so any
    // difference from remote counts as "changed" — that routes a divergent doc to
    // a conflict fork rather than letting apply-remote overwrite possibly-newer
    // local content. Identical content still resolves via hashesEqual below.
    const localChanged = local
      ? (docSync ? localHash !== docSync.syncedHash : localHash !== remoteHash)
      : false;

    const decision = decideCanvasMerge({
      hasLocal: Boolean(local),
      remoteChanged: remoteUpdatedAt > (docSync?.remoteUpdatedAt ?? 0),
      localChanged,
      hashesEqual: Boolean(local) && localHash === remoteHash,
    });

    if (decision === 'skip') continue;

    if (decision === 'sync-bookkeeping') {
      setDocSync(projectId, { remoteUpdatedAt, syncedHash: remoteHash });
      continue;
    }

    if (decision === 'fork-conflict') {
      const conflictId = `${projectId}-conflict-${Date.now().toString(36)}`;
      saveProjectSnapshot({
        id: conflictId,
        title: `${row.title || 'untitled'} conflict`,
        pages: remotePages,
        syncEnabled: false,
      });
      conflictIds.push(conflictId);
      // Acknowledge this remote version so we don't re-fork it, but keep syncedHash
      // at its prior value (empty on first contact) so localHash still looks dirty —
      // the push below then sends local up (local wins on the server, the remote copy
      // is preserved as the -conflict- doc).
      setDocSync(projectId, { remoteUpdatedAt, syncedHash: docSync?.syncedHash ?? '' });
      continue;
    }

    // apply-remote
    if (local) {
      saveProjectPages(projectId, remotePages);
      if ((local.title ?? '') !== (row.title ?? '')) updateProjectMeta(projectId, { title: row.title ?? undefined });
    } else {
      // New doc from the agent. saveProjectSnapshot creates it without enabling E2E sync.
      saveProjectSnapshot({ id: projectId, title: row.title ?? undefined, pages: remotePages });
    }
    setDocSync(projectId, { remoteUpdatedAt, syncedHash: remoteHash });
    touchedIds.push(projectId);
    if (projectId === ctx.activeProjectId) activeTouched = true;
  }

  return { touchedIds, conflictIds, activeTouched, maxUpdatedAt };
}

// PUSH: local docs whose content changed since the last sync. -conflict- docs are
// local-only artifacts and never pushed.
export async function collectCanvasPushes(scope: Set<string> | 'all', ctx: ActiveDocContext): Promise<CanvasPush[]> {
  const out: CanvasPush[] = [];
  for (const p of listProjects()) {
    if (scope !== 'all' && !scope.has(p.id)) continue;
    if (p.id.includes('-conflict-')) continue;
    const title = p.title ?? getProjectTitle(p.id);
    const pages = currentLocalPages(p.id, ctx);
    const hash = await canvasHash(title, pages);
    const docSync = getDocSync(p.id);
    if (!docSync || docSync.syncedHash !== hash) {
      out.push({ projectId: p.id, title: p.title ?? null, pages, hash });
    }
  }
  return out;
}

// Record a successful push so we don't re-push unchanged content next tick.
export function markCanvasPushed(projectId: string, updatedAtMs: number, hash: string): void {
  setDocSync(projectId, { remoteUpdatedAt: updatedAtMs, syncedHash: hash });
}
