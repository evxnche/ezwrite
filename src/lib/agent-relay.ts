// Browser half of the agent shared-canvas feature.
//
// The server applies agent writes to ezwrite_agent_canvas directly (see
// lib/agent-upstream.ts), so this no longer drains a command queue. While signed
// in with an active pairing it two-way-syncs that plaintext canvas with local
// storage:
//   1. PULL canvas rows changed since a cursor -> reconcileCanvasRows (merge,
//      forking a -conflict- doc when the owner also edited);
//   2. PUSH the owner's locally-changed docs back up;
//   3. PRUNE snapshot rows for docs abandoned by a since-closed tab.
//
// Same hand-rolled Supabase REST style as sync-client.ts. Polling only runs when
// a pairing is active.

import type { SyncSession } from './sync-client';
import type { AgentPairing } from './agent-pairing';
import { listProjects } from './projects';
import { selectOrphanSnapshotIds, type SnapshotRow } from './agent-relay-logic';
import { getCanvasCursor, setCanvasCursor } from './agent-canvas-merge';
import {
  reconcileCanvasRows,
  collectCanvasPushes,
  markCanvasPushed,
  type ActiveDocContext,
  type CanvasRow,
  type ReconcileResult,
} from './agent-canvas-sync';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const CANVAS_TABLE = 'ezwrite_agent_canvas';
const POLL_MS = 800;
const PUSH_EVERY_TICKS = 4; // push local edits ~every 3.2s, not on every poll
const STALE_PRUNE_MS = 10 * 60 * 1000; // a snapshot row this old with no matching local doc is an orphan
const PRUNE_EVERY_MS = 60 * 1000; // reap orphaned snapshot rows at most once a minute

export interface RelayHandle {
  stop: () => void;
}

function restUrl(path: string): string {
  return `${(SUPABASE_URL ?? '').replace(/\/$/, '')}/rest/v1/${path}`;
}

function headers(session: SyncSession, extra: Record<string, string> = {}): HeadersInit {
  return {
    apikey: SUPABASE_ANON_KEY ?? '',
    Authorization: `Bearer ${session.accessToken}`, // read live each call (refresh mutates in place)
    'Content-Type': 'application/json',
    ...extra,
  };
}

// Project ids this set of pairings is allowed to expose. If any pairing is
// "any project", expose everything; otherwise only the named targets.
function inScopeProjectIds(pairings: AgentPairing[]): Set<string> | 'all' {
  const active = pairings.filter((p) => !p.revoked && (!p.expiresAt || new Date(p.expiresAt).getTime() > Date.now()));
  if (active.some((p) => !p.targetProjectId)) return 'all';
  return new Set(active.map((p) => p.targetProjectId).filter((id): id is string => Boolean(id)));
}

// PULL: fetch canvas rows changed since our cursor and merge them into local
// storage. Our own pushes echo back here but reconcile skips them (hashes match).
async function pullCanvas(
  session: SyncSession,
  scope: Set<string> | 'all',
  getContext: () => ActiveDocContext,
  onReconciled?: (result: ReconcileResult) => void,
): Promise<void> {
  const since = getCanvasCursor(session.userId);
  const params = new URLSearchParams({
    select: 'project_id,title,pages,updated_at',
    user_id: `eq.${session.userId}`,
    order: 'updated_at.asc',
  });
  if (since > 0) params.set('updated_at', `gt.${new Date(since).toISOString()}`);

  const res = await fetch(restUrl(`${CANVAS_TABLE}?${params}`), { method: 'GET', headers: headers(session) });
  if (!res.ok) throw new Error(`canvas pull failed (${res.status})`);
  let rows = (await res.json()) as CanvasRow[];
  if (scope !== 'all') rows = rows.filter((r) => scope.has(r.project_id));
  if (rows.length === 0) return;

  const result = await reconcileCanvasRows(rows, getContext());
  if (result.maxUpdatedAt > since) setCanvasCursor(session.userId, result.maxUpdatedAt);
  if (result.touchedIds.length || result.conflictIds.length) onReconciled?.(result);
}

// PUSH: send up local docs whose content changed since their last sync.
async function pushCanvas(
  session: SyncSession,
  scope: Set<string> | 'all',
  getContext: () => ActiveDocContext,
): Promise<void> {
  const pushes = await collectCanvasPushes(scope, getContext());
  if (pushes.length === 0) return;

  const ts = Date.now();
  const iso = new Date(ts).toISOString();
  const rows = pushes.map((p) => ({
    user_id: session.userId,
    project_id: p.projectId,
    title: p.title,
    pages: p.pages,
    updated_at: iso,
  }));
  const res = await fetch(restUrl(`${CANVAS_TABLE}?on_conflict=user_id,project_id`), {
    method: 'POST',
    headers: headers(session, { Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`canvas push failed (${res.status})`);
  // Record what we pushed so its echo on the next pull is recognized as already-synced.
  for (const p of pushes) markCanvasPushed(p.projectId, ts, p.hash);
}

// Reap snapshot rows for docs that no longer exist on this device and have gone
// stale (no live tab refreshing them). One bounded DELETE; never runs when local
// storage reads empty, so it can't wipe a healthy canvas. Best-effort.
async function pruneOrphanSnapshots(session: SyncSession, scope: Set<string> | 'all'): Promise<void> {
  const localIds = listProjects()
    .filter((p) => scope === 'all' || scope.has(p.id))
    .map((p) => p.id);
  if (localIds.length === 0) return;

  const params = new URLSearchParams({ select: 'project_id,updated_at', user_id: `eq.${session.userId}` });
  const res = await fetch(restUrl(`${CANVAS_TABLE}?${params}`), { method: 'GET', headers: headers(session) });
  if (!res.ok) return;
  let rows = (await res.json()) as SnapshotRow[];
  if (scope !== 'all') rows = rows.filter((r) => scope.has(r.project_id));

  const orphans = selectOrphanSnapshotIds(localIds, rows, { now: Date.now(), staleMs: STALE_PRUNE_MS });
  if (orphans.length === 0) return;

  const delParams = new URLSearchParams({
    user_id: `eq.${session.userId}`,
    project_id: `in.(${orphans.join(',')})`,
  });
  await fetch(restUrl(`${CANVAS_TABLE}?${delParams}`), {
    method: 'DELETE',
    headers: headers(session, { Prefer: 'return=minimal' }),
  });
}

export function startAgentRelay(opts: {
  session: SyncSession;
  pairings: AgentPairing[];
  getContext: () => ActiveDocContext;
  onReconciled?: (result: ReconcileResult) => void;
  onError?: (error: unknown) => void;
}): RelayHandle {
  const { session, pairings, getContext, onReconciled, onError } = opts;
  const scope = inScopeProjectIds(pairings);
  let stopped = false;
  let ticking = false;
  let sinceLastPush = Infinity; // force a push on the first tick
  let lastPruneAt = 0;

  const tick = async () => {
    if (stopped || ticking) return;
    ticking = true;
    try {
      await pullCanvas(session, scope, getContext, onReconciled);
      sinceLastPush += 1;
      if (sinceLastPush >= PUSH_EVERY_TICKS) {
        await pushCanvas(session, scope, getContext);
        sinceLastPush = 0;
        // Reap abandoned snapshot rows occasionally — not on every push.
        if (Date.now() - lastPruneAt >= PRUNE_EVERY_MS) {
          lastPruneAt = Date.now();
          await pruneOrphanSnapshots(session, scope);
        }
      }
    } catch (error) {
      onError?.(error);
    } finally {
      ticking = false;
    }
  };

  void tick();
  const interval = setInterval(() => void tick(), POLL_MS);

  return {
    stop: () => {
      stopped = true;
      clearInterval(interval);
    },
  };
}
