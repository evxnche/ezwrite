import type { AgentEnv, AgentRequest, AgentResult } from './agent-upstream.ts';

type AgentHandler = (request: AgentRequest, env: AgentEnv) => Promise<AgentResult>;

interface JsonRpcRequest {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
}

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const targetProperties = {
  projectId: { type: 'string', description: 'Exact ezwrite project ID.' },
  projectTitle: { type: 'string', description: 'Document title to match when no project ID is known.' },
};

const pageProperty = {
  page: { type: 'number', description: 'Zero-based page index. Defaults to the first page.' },
};

const TOOLS: ToolDefinition[] = [
  {
    name: 'ezwrite_list_projects',
    description: 'List the ezwrite documents available to this passkey.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'ezwrite_read',
    description: 'Read an ezwrite document, including all of its pages.',
    inputSchema: { type: 'object', properties: targetProperties, additionalProperties: false },
  },
  {
    name: 'ezwrite_append',
    description: 'Append text to a page in an ezwrite document.',
    inputSchema: {
      type: 'object',
      properties: { ...targetProperties, ...pageProperty, text: { type: 'string' } },
      required: ['text'],
      additionalProperties: false,
    },
  },
  {
    name: 'ezwrite_set_content',
    description: 'Replace the complete content of a page in an ezwrite document.',
    inputSchema: {
      type: 'object',
      properties: { ...targetProperties, ...pageProperty, content: { type: 'string' } },
      required: ['content'],
      additionalProperties: false,
    },
  },
  {
    name: 'ezwrite_insert_lines',
    description: 'Insert text at a zero-based line position in an ezwrite document.',
    inputSchema: {
      type: 'object',
      properties: {
        ...targetProperties,
        ...pageProperty,
        text: { type: 'string' },
        start: { type: 'number', description: 'Zero-based line index.' },
      },
      required: ['text'],
      additionalProperties: false,
    },
  },
  {
    name: 'ezwrite_delete_lines',
    description: 'Delete lines from an ezwrite document. This cannot delete the document itself.',
    inputSchema: {
      type: 'object',
      properties: {
        ...targetProperties,
        ...pageProperty,
        start: { type: 'number', description: 'Zero-based first line to delete.' },
        count: { type: 'number', description: 'Number of lines to delete. Defaults to one.' },
      },
      required: ['start'],
      additionalProperties: false,
    },
  },
  {
    name: 'ezwrite_replace_lines',
    description: 'Replace a range of lines in an ezwrite document.',
    inputSchema: {
      type: 'object',
      properties: {
        ...targetProperties,
        ...pageProperty,
        start: { type: 'number', description: 'Zero-based first line to replace.' },
        count: { type: 'number', description: 'Number of lines to replace.' },
        text: { type: 'string' },
      },
      required: ['start', 'count', 'text'],
      additionalProperties: false,
    },
  },
  {
    name: 'ezwrite_add_page',
    description: 'Add a new page to an ezwrite document.',
    inputSchema: {
      type: 'object',
      properties: { ...targetProperties, content: { type: 'string' } },
      additionalProperties: false,
    },
  },
  {
    name: 'ezwrite_create_document',
    description: 'Create a new ezwrite document.',
    inputSchema: {
      type: 'object',
      properties: { title: { type: 'string' }, content: { type: 'string' } },
      additionalProperties: false,
    },
  },
  {
    name: 'ezwrite_rename_document',
    description: 'Rename an ezwrite document.',
    inputSchema: {
      type: 'object',
      properties: { ...targetProperties, title: { type: 'string' } },
      required: ['title'],
      additionalProperties: false,
    },
  },
];

const TOOL_ACTIONS: Record<string, string> = {
  ezwrite_list_projects: 'list_projects',
  ezwrite_read: 'read',
  ezwrite_append: 'append',
  ezwrite_set_content: 'set_content',
  ezwrite_insert_lines: 'insert_lines',
  ezwrite_delete_lines: 'delete_lines',
  ezwrite_replace_lines: 'replace_lines',
  ezwrite_add_page: 'add_page',
  ezwrite_create_document: 'create_project',
  ezwrite_rename_document: 'rename_project',
};

function bodyObj(body: unknown): JsonRpcRequest {
  if (typeof body === 'string') {
    try { return JSON.parse(body) as JsonRpcRequest; } catch { return {}; }
  }
  return body && typeof body === 'object' ? body as JsonRpcRequest : {};
}

function paramsObj(params: unknown): Record<string, unknown> {
  return params && typeof params === 'object' ? params as Record<string, unknown> : {};
}

function rpcResult(id: unknown, result: Record<string, unknown>): AgentResult {
  return { status: 200, body: { jsonrpc: '2.0', id: id ?? null, result } };
}

function rpcError(id: unknown, code: number, message: string, status = 200): AgentResult {
  return { status, body: { jsonrpc: '2.0', id: id ?? null, error: { code, message } } };
}

function readPasskey(req: AgentRequest): string {
  const direct = req.header('x-ez-passkey')?.trim();
  if (direct) return direct;
  const authorization = req.header('authorization') ?? '';
  return authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7).trim() : '';
}

export async function handleAgentMcpRequest(
  req: AgentRequest,
  env: AgentEnv,
  agentHandler?: AgentHandler,
): Promise<AgentResult> {
  if (req.method !== 'POST') {
    return rpcError(null, -32600, 'MCP requests must use POST', 405);
  }

  const body = bodyObj(req.body);
  if (body.jsonrpc !== '2.0' || typeof body.method !== 'string') {
    return rpcError(body.id, -32600, 'Invalid JSON-RPC request', 400);
  }

  if (body.method === 'initialize') {
    const requestedVersion = paramsObj(body.params).protocolVersion;
    return rpcResult(body.id, {
      protocolVersion: typeof requestedVersion === 'string' ? requestedVersion : '2025-03-26',
      capabilities: { tools: {} },
      serverInfo: { name: 'ezwrite', version: '1.0.0' },
    });
  }

  if (body.method === 'notifications/initialized') {
    return { status: 202, body: {} };
  }

  if (body.method === 'tools/list') {
    return rpcResult(body.id, { tools: TOOLS });
  }

  if (body.method !== 'tools/call') {
    return rpcError(body.id, -32601, `Method not found: ${body.method}`);
  }

  const params = paramsObj(body.params);
  const name = typeof params.name === 'string' ? params.name : '';
  const action = TOOL_ACTIONS[name];
  if (!action) return rpcError(body.id, -32602, `Unknown tool: ${name || '(missing)'}`);
  if (!agentHandler) return rpcError(body.id, -32603, 'Agent handler is not configured');

  const args = paramsObj(params.arguments);
  const passkey = readPasskey(req);
  const agentResult = await agentHandler({
    method: 'POST',
    header: (headerName) => headerName.toLowerCase() === 'x-ez-passkey' ? passkey : undefined,
    body: { action, ...args },
  }, env);
  const toolResult: Record<string, unknown> = {
    content: [{ type: 'text', text: JSON.stringify(agentResult.body) }],
    structuredContent: agentResult.body,
  };
  if (agentResult.status >= 400) toolResult.isError = true;
  return rpcResult(body.id, toolResult);
}
