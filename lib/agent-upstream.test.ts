import test from 'node:test';
import assert from 'node:assert/strict';

import { handleAgentRequest, transformPageForAgentOp, type AgentEnv } from './agent-upstream.ts';

const env: AgentEnv = {
  supabaseUrl: 'https://example.supabase.co',
  serviceRoleKey: 'service-role-key',
  anonKey: 'anon-key',
  passkeyPepper: 'pepper',
};

const activePairing = [{
  id: 'pair-1',
  user_id: 'user-1',
  label: 'claude',
  target_project_id: null,
  can_manage_projects: true,
  revoked: false,
  expires_at: null,
}];

interface CanvasRow { project_id: string; title: string | null; pages: string[] }
interface AgentEventRow { id: number; user_id: string; pairing_id: string; op: Record<string, unknown>; consumed: boolean; created_at: string }

// Stateful fake of the relevant Supabase REST endpoints so we can assert the
// canvas end-state after an op, including the empty-201 that return=minimal sends.
function installFetch(canvas: Map<string, CanvasRow>, events: AgentEventRow[] = []) {
  const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } });
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';

    if (url.includes('/auth/v1/user')) return json({ id: 'user-1' });
    if (url.includes('ezwrite_agent_pairings') && method === 'GET') return json(activePairing);
    if (url.includes('ezwrite_agent_pairings') && method === 'PATCH') return new Response(null, { status: 204 });

    if (url.includes('ezwrite_agent_canvas') && method === 'GET') {
      const m = url.match(/project_id=eq\.([^&]+)/);
      if (m) { const row = canvas.get(decodeURIComponent(m[1])); return json(row ? [row] : []); }
      return json([...canvas.values()]);
    }
    if (url.includes('ezwrite_agent_canvas') && method === 'POST') {
      const sent = JSON.parse(String(init?.body)) as CanvasRow & { user_id: string };
      canvas.set(sent.project_id, { project_id: sent.project_id, title: sent.title, pages: sent.pages });
      return new Response(null, { status: 201 }); // return=minimal -> 201, empty body
    }

    if (url.includes('ezwrite_agent_events') && method === 'GET') {
      const pendingOnly = url.includes('consumed=eq.false');
      const filtered = pendingOnly ? events.filter((event) => !event.consumed) : events;
      return json(filtered);
    }
    if (url.includes('ezwrite_agent_events') && method === 'PATCH') {
      const match = url.match(/id=eq\.([^&]+)/);
      const targetId = match ? Number(decodeURIComponent(match[1])) : NaN;
      const row = events.find((event) => event.id === targetId);
      if (row) Object.assign(row, JSON.parse(String(init?.body)));
      return new Response(null, { status: 204 });
    }
    if (url.includes('ezwrite_agent_events') && method === 'POST') {
      const body = JSON.parse(String(init?.body)) as Omit<AgentEventRow, 'id' | 'created_at'>;
      events.push({
        id: events.length + 1,
        created_at: '2026-06-12T00:00:00.000Z',
        ...body,
      });
      return new Response(JSON.stringify([{ id: events.at(-1)?.id ?? 0 }]), { status: 201, headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error(`unexpected fetch: ${method} ${url}`);
  }) as typeof fetch;
}

const passkeyHeader = (name: string) => (name.toLowerCase() === 'x-ez-passkey' ? 'cozy-pebble-98' : undefined);

test.afterEach(() => {
  delete (globalThis as typeof globalThis & { fetch?: typeof fetch }).fetch;
});

// --- pure transform --------------------------------------------------------

test('transformPageForAgentOp covers every content op', () => {
  assert.equal(transformPageForAgentOp('', { type: 'append', text: 'hi' }), 'hi');
  assert.equal(transformPageForAgentOp('a', { type: 'append', text: 'b' }), 'a\nb');
  assert.equal(transformPageForAgentOp('old', { type: 'set_content', content: 'new' }), 'new');
  assert.equal(transformPageForAgentOp('a\nc', { type: 'insert_lines', text: 'b', start: 1 }), 'a\nb\nc');
  assert.equal(transformPageForAgentOp('a\nb\nc', { type: 'delete_lines', start: 1, count: 1 }), 'a\nc');
  assert.equal(transformPageForAgentOp('a\nX\nc', { type: 'replace_lines', start: 1, count: 1, text: 'b' }), 'a\nb\nc');
});

// --- server-side apply -----------------------------------------------------

test('create_project applies to the canvas and returns the new projectId (no tab needed)', async () => {
  const canvas = new Map<string, CanvasRow>();
  installFetch(canvas);

  const result = await handleAgentRequest(
    { method: 'POST', header: passkeyHeader, body: { action: 'create_project', title: 'Letter', content: 'Dear sir' } },
    env,
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.applied, true);
  const projectId = result.body.projectId as string;
  assert.ok(projectId, 'returns a projectId');
  assert.deepEqual(canvas.get(projectId), { project_id: projectId, title: 'Letter', pages: ['Dear sir'] });
});

test('append applies the transform to the snapshot in place', async () => {
  const canvas = new Map<string, CanvasRow>([
    ['doc-1', { project_id: 'doc-1', title: 'Letter', pages: ['line one'] }],
  ]);
  installFetch(canvas);

  const result = await handleAgentRequest(
    { method: 'POST', header: passkeyHeader, body: { action: 'append', projectId: 'doc-1', text: 'line two' } },
    env,
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.applied, true);
  assert.deepEqual(canvas.get('doc-1')!.pages, ['line one\nline two']);
});

test('add_page appends a new page to an existing notebook snapshot', async () => {
  const canvas = new Map<string, CanvasRow>([
    ['doc-1', { project_id: 'doc-1', title: 'Letter', pages: ['page one'] }],
  ]);
  installFetch(canvas);

  const result = await handleAgentRequest(
    { method: 'POST', header: passkeyHeader, body: { action: 'add_page', projectId: 'doc-1', content: 'page two' } },
    env,
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.applied, true);
  assert.deepEqual(canvas.get('doc-1')!.pages, ['page one', 'page two']);
});

test('rename_project updates the title without touching pages', async () => {
  const canvas = new Map<string, CanvasRow>([
    ['doc-1', { project_id: 'doc-1', title: 'Old', pages: ['body'] }],
  ]);
  installFetch(canvas);

  const result = await handleAgentRequest(
    { method: 'POST', header: passkeyHeader, body: { action: 'rename_project', projectId: 'doc-1', title: 'New' } },
    env,
  );

  assert.equal(result.status, 200);
  assert.deepEqual(canvas.get('doc-1'), { project_id: 'doc-1', title: 'New', pages: ['body'] });
});

test('content op on a doc with no snapshot yet is a clear 404, not a crash', async () => {
  installFetch(new Map());
  const result = await handleAgentRequest(
    { method: 'POST', header: passkeyHeader, body: { action: 'append', projectId: 'ghost', text: 'x' } },
    env,
  );
  assert.equal(result.status, 404);
  assert.match(String(result.body.error), /not in the canvas/i);
});

test('claim_agent_tasks returns the next pending task for the pairing label and consumes it', async () => {
  const events: AgentEventRow[] = [
    {
      id: 1,
      user_id: 'user-1',
      pairing_id: 'pair-1',
      consumed: false,
      created_at: '2026-06-12T00:00:00.000Z',
      op: { kind: 'agent-task', taskId: 'task-1', promptId: 'prompt-1', projectId: 'doc-1', pageIndex: 0, promptText: '@Claude critique the above', targetAgentLabel: 'claude' },
    },
    {
      id: 2,
      user_id: 'user-1',
      pairing_id: 'pair-1',
      consumed: false,
      created_at: '2026-06-12T00:00:01.000Z',
      op: { kind: 'agent-task', taskId: 'task-2', promptId: 'prompt-2', projectId: 'doc-1', pageIndex: 0, promptText: '@Codex review this', targetAgentLabel: 'codex' },
    },
  ];
  installFetch(new Map(), events);

  const result = await handleAgentRequest(
    { method: 'POST', header: passkeyHeader, body: { action: 'claim_agent_tasks' } },
    env,
  );

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    task: {
      taskId: 'task-1',
      promptId: 'prompt-1',
      projectId: 'doc-1',
      pageIndex: 0,
      promptText: '@Claude critique the above',
      targetAgentLabel: 'claude',
    },
  });
  assert.equal(events[0].consumed, true);
  assert.equal(events[1].consumed, false);
});

test('submit_agent_reply appends a reply event instead of mutating the canvas directly', async () => {
  const canvas = new Map<string, CanvasRow>([
    ['doc-1', { project_id: 'doc-1', title: 'Letter', pages: ['original'] }],
  ]);
  const events: AgentEventRow[] = [];
  installFetch(canvas, events);

  const result = await handleAgentRequest(
    {
      method: 'POST',
      header: passkeyHeader,
      body: {
        action: 'submit_agent_reply',
        taskId: 'task-1',
        promptId: 'prompt-1',
        projectId: 'doc-1',
        pageIndex: 0,
        replyText: 'looks solid',
        status: 'done',
      },
    },
    env,
  );

  assert.equal(result.status, 200);
  assert.deepEqual(canvas.get('doc-1'), { project_id: 'doc-1', title: 'Letter', pages: ['original'] });
  assert.deepEqual(events.map((event) => event.op), [
    {
      kind: 'agent-reply',
      taskId: 'task-1',
      promptId: 'prompt-1',
      projectId: 'doc-1',
      pageIndex: 0,
      agentLabel: 'claude',
      replyText: 'looks solid',
      status: 'done',
    },
  ]);
});

test('queue_agent_tasks inserts one event per targeted agent through the user-authenticated path', async () => {
  const events: AgentEventRow[] = [];
  installFetch(new Map(), events);

  const result = await handleAgentRequest(
    {
      method: 'POST',
      header: (name) => (name.toLowerCase() === 'authorization' ? 'Bearer session-token' : undefined),
      body: {
        action: 'queue_agent_tasks',
        tasks: [
          { taskId: 'task-1', promptId: 'prompt-1', projectId: 'doc-1', pageIndex: 0, promptText: '@Claude review this', fingerprint: 'fp-1', targetAgentId: 'pair-claude', targetAgentLabel: 'Claude' },
          { taskId: 'task-2', promptId: 'prompt-1', projectId: 'doc-1', pageIndex: 0, promptText: '@Claude @Codex review this', fingerprint: 'fp-1', targetAgentId: 'pair-codex', targetAgentLabel: 'Codex' },
        ],
      },
    },
    env,
  );

  assert.equal(result.status, 200);
  assert.equal(events.length, 2);
  assert.deepEqual(events.map((event) => event.op), [
    {
      kind: 'agent-task',
      taskId: 'task-1',
      promptId: 'prompt-1',
      projectId: 'doc-1',
      pageIndex: 0,
      promptText: '@Claude review this',
      fingerprint: 'fp-1',
      targetAgentId: 'pair-claude',
      targetAgentLabel: 'claude',
    },
    {
      kind: 'agent-task',
      taskId: 'task-2',
      promptId: 'prompt-1',
      projectId: 'doc-1',
      pageIndex: 0,
      promptText: '@Claude @Codex review this',
      fingerprint: 'fp-1',
      targetAgentId: 'pair-codex',
      targetAgentLabel: 'codex',
    },
  ]);
});
