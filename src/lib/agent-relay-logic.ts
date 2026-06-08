// Pure decision logic for the agent relay (no Vite env / DOM / localStorage deps)
// so it can be unit-tested under node:test. agent-relay.ts wires this into fetch.

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
