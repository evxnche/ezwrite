// Browser relay for the agent shared-canvas feature.
//
// While signed in with at least one active pairing, this:
//   1. drains agent -> canvas commands (ezwrite_agent_events) and hands each to
//      applyOp(), which mutates the canvas live;
//   2. publishes the current canvas (ezwrite_agent_canvas) so agents can read/list.
//
// It deliberately uses the same hand-rolled Supabase REST style as sync-client.ts
// (no @supabase/supabase-js). Polling only runs when a pairing is active.

import type { SyncSession } from './sync-client';
import type { AgentPairing } from './agent-pairing';
import { listProjects, getProjectPages, getProjectTitle } from './projects';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const EVENTS_TABLE = 'ezwrite_agent_events';
const CANVAS_TABLE = 'ezwrite_agent_canvas';
const POLL_MS = 800;

export interface AgentOp {
  type: string;
  projectId?: string;
  projectTitle?: string;
  page?: number;
  text?: string;
  content?: string;
  title?: string;
  start?: number;
  count?: number;
  label?: string | null; // pairing label, for attribution toasts
}

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

interface EventRow {
  id: number;
  op: AgentOp;
  ezwrite_agent_pairings: { label: string | null } | null;
}

async function drainEvents(session: SyncSession, applyOp: (op: AgentOp) => void): Promise<void> {
  const params = new URLSearchParams({
    select: 'id,op,ezwrite_agent_pairings(label)',
    user_id: `eq.${session.userId}`,
    consumed: 'is.false',
    order: 'id.asc',
    limit: '50',
  });
  const res = await fetch(restUrl(`${EVENTS_TABLE}?${params}`), { method: 'GET', headers: headers(session) });
  if (!res.ok) throw new Error(`relay poll failed (${res.status})`);
  const rows = (await res.json()) as EventRow[];
  if (rows.length === 0) return;

  for (const row of rows) {
    try {
      applyOp({ ...row.op, label: row.ezwrite_agent_pairings?.label ?? null });
    } catch {
      // A bad op shouldn't wedge the queue — it still gets marked consumed below.
    }
  }

  const ids = rows.map((r) => r.id);
  const patchParams = new URLSearchParams({ id: `in.(${ids.join(',')})`, user_id: `eq.${session.userId}` });
  await fetch(restUrl(`${EVENTS_TABLE}?${patchParams}`), {
    method: 'PATCH',
    headers: headers(session, { Prefer: 'return=minimal' }),
    body: JSON.stringify({ consumed: true }),
  });
}

async function publishSnapshots(session: SyncSession, scope: Set<string> | 'all'): Promise<void> {
  const projects = listProjects().filter((p) => scope === 'all' || scope.has(p.id));
  if (projects.length === 0) return;
  const rows = projects.map((p) => ({
    user_id: session.userId,
    project_id: p.id,
    title: p.title ?? getProjectTitle(p.id),
    pages: getProjectPages(p.id),
    updated_at: new Date().toISOString(),
  }));
  await fetch(restUrl(`${CANVAS_TABLE}?on_conflict=user_id,project_id`), {
    method: 'POST',
    headers: headers(session, { Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(rows),
  });
}

export function startAgentRelay(opts: {
  session: SyncSession;
  pairings: AgentPairing[];
  applyOp: (op: AgentOp) => void;
  onError?: (error: unknown) => void;
}): RelayHandle {
  const { session, pairings, applyOp, onError } = opts;
  const scope = inScopeProjectIds(pairings);
  let stopped = false;
  let ticking = false;
  let sinceLastPublish = Infinity; // force a publish on the first tick

  const tick = async () => {
    if (stopped || ticking) return;
    ticking = true;
    try {
      await drainEvents(session, applyOp);
      // Refresh snapshots roughly every ~3.2s (every 4th tick) so reads stay current
      // without hammering the DB on every poll.
      sinceLastPublish += 1;
      if (sinceLastPublish >= 4) {
        await publishSnapshots(session, scope);
        sinceLastPublish = 0;
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
