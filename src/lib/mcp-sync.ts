// MCP sync client — connects ezwrite frontend to the local MCP server
// When connected, the MCP server (file-backed) is the source of truth.
// Falls back to localStorage when disconnected.

const MCP_SYNC_URL = 'http://localhost:3157';
const MCP_WS_URL = 'ws://localhost:3157/ws';

export interface McpProjectData {
  meta: {
    id: string;
    title?: string;
    createdAt: number;
    updatedAt: number;
    syncEnabled?: boolean;
    syncLastRemoteUpdatedAt?: number;
    syncLastPushedAt?: number;
    syncLastPulledAt?: number;
    syncLastPayloadHash?: string;
  };
  pages: string[];
  scratchpad: string;
  timestamps: number[];
  lastPage: number;
}

interface McpSnapshot {
  activeProjectId: string | null;
  projects: McpProjectData[];
}

type SyncListener = (snapshot: McpSnapshot) => void;

let ws: WebSocket | null = null;
let connected = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<SyncListener>();

export function isMcpSyncConnected(): boolean {
  return connected;
}

export function onMcpSyncChange(listener: SyncListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(snapshot: McpSnapshot) {
  for (const listener of listeners) listener(snapshot);
}

function connectWebSocket() {
  if (ws) return;

  try {
    ws = new WebSocket(MCP_WS_URL);

    ws.onopen = () => {
      connected = true;
      console.log('[mcp-sync] Connected to MCP server');
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string);
        if (msg.type === 'init' || msg.type === 'update') {
          notify(msg.data as McpSnapshot);
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      connected = false;
      ws = null;
      console.log('[mcp-sync] Disconnected, reconnecting in 3s...');
      reconnectTimer = setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = () => {
      // onclose will fire after this
    };
  } catch {
    connected = false;
    ws = null;
    reconnectTimer = setTimeout(connectWebSocket, 5000);
  }
}

export function startMcpSync(): void {
  connectWebSocket();
}

export function stopMcpSync(): void {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (ws) ws.close();
  ws = null;
  connected = false;
}

// --- REST helpers ---

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${MCP_SYNC_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `MCP API error ${res.status}`);
  }
  return res.json();
}

// --- Import localStorage data into MCP server ---

export async function pushLocalStorageToMcp(): Promise<void> {
  // Read from localStorage (same keys as src/lib/projects.ts)
  const projectsRaw = localStorage.getItem('ezwrite-projects');
  if (!projectsRaw) return;

  const metas = JSON.parse(projectsRaw);
  const activeId = localStorage.getItem('ezwrite-active-project');
  const projects: McpProjectData[] = [];

  for (const meta of metas) {
    const pagesRaw = localStorage.getItem(`ezwrite-project-${meta.id}`);
    const pages = pagesRaw ? JSON.parse(pagesRaw) : [''];
    const scratchpad = localStorage.getItem(`ezwrite-project-${meta.id}-scratchpad`) ?? '';
    const timestampsRaw = localStorage.getItem(`ezwrite-project-${meta.id}-ts`);
    const timestamps = timestampsRaw ? JSON.parse(timestampsRaw) : [Date.now()];
    const lastPageRaw = localStorage.getItem(`ezwrite-project-${meta.id}-lp`);
    const lastPage = lastPageRaw ? parseInt(lastPageRaw, 10) : 0;

    projects.push({ meta, pages, scratchpad, timestamps, lastPage });
  }

  await api('/api/import', {
    method: 'POST',
    body: JSON.stringify({ activeProjectId: activeId, projects }),
  });
}

// --- Pull MCP server data into localStorage ---

export async function pullMcpToLocalStorage(): Promise<void> {
  const snapshot: McpSnapshot = await api('/api/snapshot');

  // Write projects meta
  localStorage.setItem('ezwrite-projects', JSON.stringify(snapshot.projects.map((p) => p.meta)));

  // Write active project
  if (snapshot.activeProjectId) {
    localStorage.setItem('ezwrite-active-project', snapshot.activeProjectId);
  }

  // Write each project's data
  for (const project of snapshot.projects) {
    localStorage.setItem(`ezwrite-project-${project.meta.id}`, JSON.stringify(project.pages));
    localStorage.setItem(`ezwrite-project-${project.meta.id}-bak`, JSON.stringify(project.pages));
    localStorage.setItem(`ezwrite-project-${project.meta.id}-ts`, JSON.stringify(project.timestamps));
    localStorage.setItem(`ezwrite-project-${project.meta.id}-lp`, String(project.lastPage));
    localStorage.setItem(`ezwrite-project-${project.meta.id}-scratchpad`, project.scratchpad);
    localStorage.setItem(`ezwrite-project-${project.meta.id}-scratchpad-bak`, project.scratchpad);
  }
}
