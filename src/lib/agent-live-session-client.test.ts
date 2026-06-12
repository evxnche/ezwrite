import test from 'node:test';
import assert from 'node:assert/strict';

import {
  consumeAgentReplyEvents,
  listPendingAgentReplies,
  queueAgentTasks,
  setAgentLiveSessionEnvForTests,
  type AgentReplyEvent,
} from './agent-live-session-client.ts';

const session = {
  accessToken: 'session-token',
  userId: 'user-1',
} as const;

test.afterEach(() => {
  delete (globalThis as typeof globalThis & { fetch?: typeof fetch }).fetch;
  setAgentLiveSessionEnvForTests(null);
});

test('queueAgentTasks posts browser-created agent tasks through /api/agent with Bearer auth', async () => {
  let request: { url: string; method?: string; headers?: HeadersInit; body?: BodyInit | null } | null = null;
  globalThis.fetch = async (input, init) => {
    request = { url: String(input), method: init?.method, headers: init?.headers, body: init?.body ?? null };
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  await queueAgentTasks(session, [
    {
      taskId: 'task-1',
      promptId: 'prompt-1',
      projectId: 'doc-1',
      pageIndex: 0,
      promptText: '@Claude review this',
      fingerprint: 'fp-1',
      targetAgentId: 'pair-claude',
      targetAgentLabel: 'Claude',
    },
  ]);

  assert.ok(request);
  assert.equal(request.url, '/api/agent');
  assert.equal(request.method, 'POST');
  assert.match(JSON.stringify(request.headers), /Bearer session-token/);
  assert.match(String(request.body), /queue_agent_tasks/);
});

test('listPendingAgentReplies returns only unconsumed reply events for the requested project', async () => {
  setAgentLiveSessionEnvForTests({ VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon-key' });
  globalThis.fetch = async () => new Response(JSON.stringify([
    { id: 1, op: { kind: 'agent-reply', projectId: 'doc-1', promptId: 'prompt-1', agentId: 'pair-claude', agentLabel: 'Claude', replyText: 'done', status: 'done' }, consumed: false, created_at: '' },
    { id: 2, op: { kind: 'agent-task', projectId: 'doc-1' }, consumed: false, created_at: '' },
    { id: 3, op: { kind: 'agent-reply', projectId: 'doc-2', promptId: 'prompt-2', agentId: 'pair-codex', agentLabel: 'Codex', replyText: 'skip', status: 'done' }, consumed: false, created_at: '' },
  ]), { status: 200, headers: { 'Content-Type': 'application/json' } });

  const replies = await listPendingAgentReplies(session, 'doc-1');

  assert.deepEqual(replies, [
    {
      eventId: 1,
      promptId: 'prompt-1',
      agentId: 'pair-claude',
      agentLabel: 'Claude',
      replyText: 'done',
      status: 'done',
      projectId: 'doc-1',
      pageIndex: 0,
    },
  ] satisfies AgentReplyEvent[]);
});

test('consumeAgentReplyEvents patches consumed=true for each processed reply event', async () => {
  setAgentLiveSessionEnvForTests({ VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon-key' });
  const calls: string[] = [];
  globalThis.fetch = async (input, init) => {
    calls.push(`${init?.method ?? 'GET'} ${String(input)}`);
    return new Response(null, { status: 204 });
  };

  await consumeAgentReplyEvents(session, [1, 2]);

  assert.deepEqual(calls, [
    'PATCH https://example.supabase.co/rest/v1/ezwrite_agent_events?id=eq.1&user_id=eq.user-1',
    'PATCH https://example.supabase.co/rest/v1/ezwrite_agent_events?id=eq.2&user_id=eq.user-1',
  ]);
});
