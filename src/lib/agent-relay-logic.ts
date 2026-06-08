// Pure decision logic for the agent relay (no Vite env / DOM / localStorage deps)
// so it can be unit-tested under node:test. agent-relay.ts wires these into fetch
// and the live canvas; everything here is deterministic given its inputs.

export const MAX_OP_ATTEMPTS = 3;

// --- draining: which queued events to consume, retry, or drop --------------

export interface OpOutcome {
  id: number;
  ok: boolean; // applyOp returned without throwing
  error?: string; // failure message when !ok
}

export interface DrainDecision {
  consumedIds: number[]; // mark consumed: applied cleanly OR dead-lettered
  deadLettered: { id: number; error: string }[]; // surface these to the owner
}

// An op that applies cleanly is consumed. An op that throws is treated as a
// transient failure: left un-consumed so the next tick retries it — but only up
// to maxAttempts, after which it is dead-lettered (consumed + reported) so one
// poison op can never wedge the queue forever. `attempts` carries retry counts
// across ticks and is mutated here (incremented on failure, cleared when done).
export function decideDrain(
  outcomes: OpOutcome[],
  attempts: Map<number, number>,
  maxAttempts: number = MAX_OP_ATTEMPTS,
): DrainDecision {
  const consumedIds: number[] = [];
  const deadLettered: { id: number; error: string }[] = [];
  for (const o of outcomes) {
    if (o.ok) {
      attempts.delete(o.id);
      consumedIds.push(o.id);
      continue;
    }
    const next = (attempts.get(o.id) ?? 0) + 1;
    if (next >= maxAttempts) {
      attempts.delete(o.id);
      consumedIds.push(o.id);
      deadLettered.push({ id: o.id, error: o.error ?? 'apply failed' });
    } else {
      attempts.set(o.id, next);
    }
  }
  return { consumedIds, deadLettered };
}

// --- pruning: stale orphan snapshot rows -----------------------------------

export interface SnapshotRow {
  project_id: string;
  updated_at: string;
}

// A snapshot row is an orphan when its doc no longer exists locally AND it hasn't
// been refreshed within staleMs. An active tab republishes every doc it holds
// every few seconds, so live rows stay fresh and are never selected; this only
// reaps genuinely abandoned rows (e.g. a doc an agent created in a tab that has
// since closed). Returns [] when there are no local ids, as a guard against
// wiping the whole canvas if local storage momentarily reads empty.
export function selectOrphanSnapshotIds(
  localIds: Iterable<string>,
  rows: SnapshotRow[],
  opts: { now: number; staleMs: number },
): string[] {
  const local = new Set(localIds);
  if (local.size === 0) return [];
  const out: string[] = [];
  for (const r of rows) {
    if (local.has(r.project_id)) continue;
    const t = Date.parse(r.updated_at);
    if (Number.isFinite(t) && opts.now - t >= opts.staleMs) out.push(r.project_id);
  }
  return out;
}
