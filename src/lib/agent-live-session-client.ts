import type { AgentTaskPayload } from './agent-live-session.ts';

type AgentLiveSessionEnv = {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
};

let agentLiveSessionEnvOverride: AgentLiveSessionEnv | null = null;

export interface AgentReplyEvent {
  eventId: number;
  promptId: string;
  agentId: string;
  agentLabel: string;
  replyText: string;
  status: 'pending' | 'done' | 'error';
  projectId: string;
  pageIndex: number;
}

export function setAgentLiveSessionEnvForTests(env: AgentLiveSessionEnv | null): void {
  agentLiveSessionEnvOverride = env;
}

function getEnv(): AgentLiveSessionEnv {
  if (agentLiveSessionEnvOverride) return agentLiveSessionEnvOverride;
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return {
      VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL as string | undefined,
      VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
    };
  }
  return {};
}

function restUrl(path: string): string {
  const { VITE_SUPABASE_URL } = getEnv();
  if (!VITE_SUPABASE_URL) throw new Error('Missing VITE_SUPABASE_URL');
  return `${VITE_SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${path}`;
}

function restHeaders(accessToken: string, extra: Record<string, string> = {}): HeadersInit {
  const { VITE_SUPABASE_ANON_KEY } = getEnv();
  if (!VITE_SUPABASE_ANON_KEY) throw new Error('Missing VITE_SUPABASE_ANON_KEY');
  return {
    apikey: VITE_SUPABASE_ANON_KEY,
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

export async function queueAgentTasks(
  session: { accessToken: string },
  tasks: AgentTaskPayload[],
): Promise<void> {
  const res = await fetch('/api/agent', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.accessToken}`,
    },
    body: JSON.stringify({
      action: 'queue_agent_tasks',
      tasks,
    }),
  });
  if (!res.ok) throw new Error(`Could not queue live agent tasks (${res.status})`);
}

export async function listPendingAgentReplies(
  session: { accessToken: string; userId: string },
  projectId: string,
): Promise<AgentReplyEvent[]> {
  const params = new URLSearchParams({
    select: 'id,op,consumed,created_at',
    user_id: `eq.${session.userId}`,
    consumed: 'eq.false',
    order: 'created_at.asc',
  });
  const res = await fetch(restUrl(`ezwrite_agent_events?${params}`), {
    method: 'GET',
    headers: restHeaders(session.accessToken),
  });
  if (!res.ok) throw new Error(`Could not load live agent replies (${res.status})`);
  const rows = await res.json() as Array<{ id: number; op: Record<string, unknown> }>;
  return rows.flatMap((row) => {
    if (row.op.kind !== 'agent-reply') return [];
    if (row.op.projectId !== projectId) return [];
    const status = row.op.status === 'pending' || row.op.status === 'done' || row.op.status === 'error'
      ? row.op.status
      : 'done';
    return [{
      eventId: row.id,
      promptId: String(row.op.promptId ?? ''),
      agentId: String(row.op.agentId ?? ''),
      agentLabel: String(row.op.agentLabel ?? ''),
      replyText: String(row.op.replyText ?? ''),
      status,
      projectId: String(row.op.projectId ?? ''),
      pageIndex: typeof row.op.pageIndex === 'number' ? row.op.pageIndex : 0,
    }];
  });
}

export async function consumeAgentReplyEvents(
  session: { accessToken: string; userId: string },
  eventIds: number[],
): Promise<void> {
  for (const eventId of eventIds) {
    const params = new URLSearchParams({ id: `eq.${eventId}`, user_id: `eq.${session.userId}` });
    const res = await fetch(restUrl(`ezwrite_agent_events?${params}`), {
      method: 'PATCH',
      headers: restHeaders(session.accessToken, { Prefer: 'return=minimal' }),
      body: JSON.stringify({ consumed: true }),
    });
    if (!res.ok) throw new Error(`Could not consume live agent reply (${res.status})`);
  }
}
