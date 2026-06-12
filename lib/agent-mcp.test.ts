import test from 'node:test';
import assert from 'node:assert/strict';

import { handleAgentMcpRequest } from './agent-mcp.ts';
import type { AgentEnv, AgentRequest, AgentResult } from './agent-upstream.ts';

const env: AgentEnv = {
  supabaseUrl: 'https://example.supabase.co',
  serviceRoleKey: 'service-role-key',
  anonKey: 'anon-key',
  passkeyPepper: 'pepper',
};

const bearerHeader = (name: string) => (
  name.toLowerCase() === 'authorization' ? 'Bearer tidy-acorn-33' : undefined
);

test('MCP initialize returns ezwrite server metadata', async () => {
  const result = await handleAgentMcpRequest({
    method: 'POST',
    header: bearerHeader,
    body: {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-03-26' },
    },
  }, env);

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    jsonrpc: '2.0',
    id: 1,
    result: {
      protocolVersion: '2025-03-26',
      capabilities: { tools: {} },
      serverInfo: { name: 'ezwrite', version: '1.0.0' },
    },
  });
});

test('MCP tools/list advertises document operations without delete', async () => {
  const result = await handleAgentMcpRequest({
    method: 'POST',
    header: bearerHeader,
    body: { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
  }, env);

  const tools = (result.body.result as { tools: Array<{ name: string }> }).tools;
  const names = tools.map((tool) => tool.name);
  assert.deepEqual(names, [
    'ezwrite_list_projects',
    'ezwrite_read',
    'ezwrite_append',
    'ezwrite_set_content',
    'ezwrite_insert_lines',
    'ezwrite_delete_lines',
    'ezwrite_replace_lines',
    'ezwrite_add_page',
    'ezwrite_create_document',
    'ezwrite_rename_document',
    'ezwrite_claim_agent_tasks',
    'ezwrite_submit_agent_reply',
  ]);
  assert.equal(names.includes('ezwrite_delete_document'), false);
});

test('MCP tools/call forwards the Poke bearer API key as the ezwrite passkey', async () => {
  let forwarded: AgentRequest | null = null;
  const fakeAgentHandler = async (request: AgentRequest): Promise<AgentResult> => {
    forwarded = request;
    return { status: 200, body: { projects: [{ projectId: 'doc-1', title: 'Letter' }] } };
  };

  const result = await handleAgentMcpRequest({
    method: 'POST',
    header: bearerHeader,
    body: {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'ezwrite_list_projects', arguments: {} },
    },
  }, env, fakeAgentHandler);

  assert.ok(forwarded);
  assert.equal(forwarded.method, 'POST');
  assert.equal(forwarded.header('x-ez-passkey'), 'tidy-acorn-33');
  assert.deepEqual(forwarded.body, { action: 'list_projects' });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    jsonrpc: '2.0',
    id: 3,
    result: {
      content: [{
        type: 'text',
        text: JSON.stringify({ projects: [{ projectId: 'doc-1', title: 'Letter' }] }),
      }],
      structuredContent: { projects: [{ projectId: 'doc-1', title: 'Letter' }] },
    },
  });
});

test('MCP tools/call reports agent API failures as tool errors', async () => {
  const result = await handleAgentMcpRequest({
    method: 'POST',
    header: bearerHeader,
    body: {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'ezwrite_read', arguments: { projectId: 'missing' } },
    },
  }, env, async () => ({ status: 404, body: { error: 'Document not found' } }));

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    jsonrpc: '2.0',
    id: 4,
    result: {
      content: [{ type: 'text', text: JSON.stringify({ error: 'Document not found' }) }],
      structuredContent: { error: 'Document not found' },
      isError: true,
    },
  });
});

test('MCP exposes the live-task claim tool through the shared agent handler', async () => {
  let forwarded: AgentRequest | null = null;
  const result = await handleAgentMcpRequest({
    method: 'POST',
    header: bearerHeader,
    body: {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'ezwrite_claim_agent_tasks', arguments: {} },
    },
  }, env, async (request) => {
    forwarded = request;
    return { status: 200, body: { task: { taskId: 'task-1' } } };
  });

  assert.equal(forwarded?.body.action, 'claim_agent_tasks');
  assert.equal(result.status, 200);
});

test('MCP exposes the live-task reply tool through the shared agent handler', async () => {
  let forwarded: AgentRequest | null = null;
  const result = await handleAgentMcpRequest({
    method: 'POST',
    header: bearerHeader,
    body: {
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: {
        name: 'ezwrite_submit_agent_reply',
        arguments: { taskId: 'task-1', promptId: 'prompt-1', projectId: 'doc-1', pageIndex: 0, replyText: 'done' },
      },
    },
  }, env, async (request) => {
    forwarded = request;
    return { status: 200, body: { ok: true } };
  });

  assert.deepEqual(forwarded?.body, {
    action: 'submit_agent_reply',
    taskId: 'task-1',
    promptId: 'prompt-1',
    projectId: 'doc-1',
    pageIndex: 0,
    replyText: 'done',
  });
  assert.equal(result.status, 200);
});
