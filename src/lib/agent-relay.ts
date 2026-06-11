// Browser half of the agent shared-canvas feature.
//
// The server applies agent writes to ezwrite_agent_canvas directly (see
// lib/agent-upstream.ts), so this no longer drains a command queue. While signed
// in with an active pairing it runs one clock-free two-way sync pass per tick:
// fetch the in-scope canvas rows, reconcile the union of canvas + local storage
// (syncCanvas), then push locally-changed/seed docs up and delete canvas rows for
// docs the owner removed. Every pass re-evaluates full state, so a failed network
// op simply heals on the next tick.
//
// Same hand-rolled Supabase REST style as sync-client.ts. Polling only runs when a
// pairing is active.

import type { SyncSession } from './sync-client';
import type { AgentPairing } from './agent-pairing';
import { clearSyncedHash } from './agent-canvas-merge';
import {
  syncCanvas,
  markCanvasPushed,
  type ActiveDocContext,
  type CanvasRow,
  type CanvasPush,
  type SyncResult,
} from './agent-canvas-sync';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const CANVAS_TABLE = 'ezwrite_agent_canvas';
const POLL_MS = 1500; // full two-way pass cadence; agent edits surface within ~1.5s

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

async function fetchCanvasRows(session: SyncSession, scope: Set<string> | 'all'): Promise<CanvasRow[]> {
  const params = new URLSearchParams({ select: 'project_id,title,pages', user_id: `eq.${session.userId}` });
  if (scope !== 'all') {
    if (scope.size === 0) return [];
    params.set('project_id', `in.(${[...scope].join(',')})`);
  }
  const res = await fetch(restUrl(`${CANVAS_TABLE}?${params}`), { method: 'GET', headers: headers(session) });
  if (!res.ok) throw new Error(`canvas pull failed (${res.status})`);
  return (await res.json()) as CanvasRow[];
}

async function pushRows(session: SyncSession, pushes: CanvasPush[]): Promise<void> {
  const iso = new Date().toISOString();
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
  for (const p of pushes) markCanvasPushed(p.projectId, p.hash); // only on success
}

async function deleteRows(session: SyncSession, ids: string[]): Promise<void> {
  const params = new URLSearchParams({ user_id: `eq.${session.userId}`, project_id: `in.(${ids.join(',')})` });
  const res = await fetch(restUrl(`${CANVAS_TABLE}?${params}`), {
    method: 'DELETE',
    headers: headers(session, { Prefer: 'return=minimal' }),
  });
  if (!res.ok) throw new Error(`canvas delete failed (${res.status})`);
  for (const id of ids) clearSyncedHash(id); // only on success
}

export function startAgentRelay(opts: {
  session: SyncSession;
  pairings: AgentPairing[];
  getContext: () => ActiveDocContext;
  onReconciled?: (result: SyncResult) => void;
  onError?: (error: unknown) => void;
}): RelayHandle {
  const { session, pairings, getContext, onReconciled, onError } = opts;
  const scope = inScopeProjectIds(pairings);
  let stopped = false;
  let ticking = false;

  const tick = async () => {
    if (stopped || ticking) return;
    ticking = true;
    try {
      const rows = await fetchCanvasRows(session, scope);
      const result = await syncCanvas(rows, getContext(), scope);
      if (result.pushes.length) await pushRows(session, result.pushes);
      if (result.deletes.length) await deleteRows(session, result.deletes);
      if (result.touchedIds.length || result.conflictIds.length) onReconciled?.(result);
    } catch (error) {
      onError?.(error); // transient failures heal on the next pass (full state re-evaluated)
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
