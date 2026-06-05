// Lightweight per-doc safety net for agent edits. Before an agent's burst of
// edits, we snapshot the doc's pages so the user can roll back if the agent makes
// a mess. Stored in localStorage as a small ring buffer (newest last).

const MAX_CHECKPOINTS = 10;

export interface AgentCheckpoint {
  ts: number;
  label: string;   // agent name, for display
  pages: string[]; // doc contents at snapshot time
}

function key(projectId: string): string {
  return `ezwrite-agent-ckpt-${projectId}`;
}

export function listAgentCheckpoints(projectId: string): AgentCheckpoint[] {
  try {
    const raw = localStorage.getItem(key(projectId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveAgentCheckpoint(projectId: string, label: string, pages: string[]): void {
  const list = listAgentCheckpoints(projectId);
  list.push({ ts: Date.now(), label, pages: pages.map((p) => String(p ?? '')) });
  while (list.length > MAX_CHECKPOINTS) list.shift();
  try {
    localStorage.setItem(key(projectId), JSON.stringify(list));
  } catch {
    // Quota errors are non-fatal — the edit still applies, we just can't snapshot.
  }
}

// Removes and returns the most recent checkpoint (one level of undo).
export function popAgentCheckpoint(projectId: string): AgentCheckpoint | null {
  const list = listAgentCheckpoints(projectId);
  const last = list.pop();
  if (!last) return null;
  try {
    if (list.length) localStorage.setItem(key(projectId), JSON.stringify(list));
    else localStorage.removeItem(key(projectId));
  } catch {
    // ignore
  }
  return last;
}

export function hasAgentCheckpoint(projectId: string): boolean {
  return listAgentCheckpoints(projectId).length > 0;
}
