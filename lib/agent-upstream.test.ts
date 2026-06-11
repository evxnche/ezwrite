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
  label: 'cc',
  target_project_id: null,
  can_manage_projects: true,
  revoked: false,
  expires_at: null,
}];

interface CanvasRow { project_id: string; title: string | null; pages: string[] }

// Stateful fake of the relevant Supabase REST endpoints so we can assert the
// canvas end-state after an op, including the empty-201 that return=minimal sends.
function installFetch(canvas: Map<string, CanvasRow>) {
  const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } });
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';

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
