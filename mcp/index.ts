import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { Store } from './store.js';

const store = new Store();
const MCP_PATH = '/mcp';
const HTTP_PORT = parseInt(process.env.EZWRITE_MCP_PORT ?? '3157', 10);

// --- MCP Server ---

const server = new McpServer({
  name: 'ezwrite',
  version: '0.1.0',
});

// ---- Project tools ----

server.tool(
  'list_projects',
  'List all ezwrite notebooks with their titles, creation dates, and page counts.',
  {},
  async () => {
    const projects = store.listProjects();
    const activeId = store.getActiveProjectId();
    const lines = projects.map((p) => {
      const data = store.getProject(p.id);
      const active = p.id === activeId ? ' ← active' : '';
      const pages = data ? data.pages.length : 0;
      return `- [${p.id}] "${p.title ?? 'untitled'}" (${pages} page${pages !== 1 ? 's' : ''}, updated ${new Date(p.updatedAt).toLocaleString()})${active}`;
    });
    return {
      content: [{ type: 'text', text: lines.length ? lines.join('\n') : 'No notebooks found.' }],
    };
  },
);

server.tool(
  'get_project',
  'Get full details of a notebook: all page contents and scratchpad.',
  { id: z.string().describe('Notebook/project ID') },
  async ({ id }) => {
    const project = store.getProject(id);
    if (!project) return { content: [{ type: 'text', text: `Notebook "${id}" not found.` }], isError: true };

    const lines: string[] = [
      `# ${project.meta.title ?? 'untitled'}`,
      `ID: ${project.meta.id}`,
      `Created: ${new Date(project.meta.createdAt).toLocaleString()}`,
      `Updated: ${new Date(project.meta.updatedAt).toLocaleString()}`,
      '',
    ];

    for (let i = 0; i < project.pages.length; i++) {
      lines.push(`--- Page ${i + 1} ---`);
      lines.push(project.pages[i]);
      lines.push('');
    }

    if (project.scratchpad.trim()) {
      lines.push('--- Scratchpad ---');
      lines.push(project.scratchpad);
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  },
);

server.tool(
  'get_page',
  'Get the content of a specific page in a notebook.',
  {
    id: z.string().describe('Notebook/project ID'),
    page: z.number().int().min(1).describe('Page number (1-indexed)'),
  },
  async ({ id, page }) => {
    const content = store.getPage(id, page - 1);
    if (content === null) return { content: [{ type: 'text', text: `Page ${page} not found in notebook "${id}".` }], isError: true };
    return { content: [{ type: 'text', text: content }] };
  },
);

server.tool(
  'get_scratchpad',
  "Get a notebook's scratchpad content.",
  { id: z.string().describe('Notebook/project ID') },
  async ({ id }) => {
    const content = store.getScratchpad(id);
    if (content === null) return { content: [{ type: 'text', text: `Notebook "${id}" not found.` }], isError: true };
    return { content: [{ type: 'text', text: content || '(scratchpad is empty)' }] };
  },
);

server.tool(
  'create_project',
  'Create a new notebook with an optional title and first page content.',
  {
    title: z.string().optional().describe('Notebook title'),
    content: z.string().optional().describe('First page content'),
  },
  async ({ title, content }) => {
    const project = store.createProject(content ?? '', title);
    return {
      content: [{ type: 'text', text: `Created notebook "${project.meta.title ?? 'untitled'}" (${project.meta.id})` }],
    };
  },
);

server.tool(
  'update_page',
  'Replace the content of a specific page in a notebook.',
  {
    id: z.string().describe('Notebook/project ID'),
    page: z.number().int().min(1).describe('Page number (1-indexed)'),
    content: z.string().describe('New page content'),
  },
  async ({ id, page, content }) => {
    const project = store.getProject(id);
    if (!project) return { content: [{ type: 'text', text: `Notebook "${id}" not found.` }], isError: true };
    if (page < 1 || page > project.pages.length) {
      return { content: [{ type: 'text', text: `Page ${page} out of range (1–${project.pages.length}).` }], isError: true };
    }
    store.updatePage(id, page - 1, content);
    return { content: [{ type: 'text', text: `Updated page ${page} of "${project.meta.title ?? 'untitled'}".` }] };
  },
);

server.tool(
  'add_page',
  'Add a new page to a notebook.',
  {
    id: z.string().describe('Notebook/project ID'),
    content: z.string().optional().describe('Page content'),
  },
  async ({ id, content }) => {
    const pageIndex = store.addPage(id, content ?? '');
    if (pageIndex < 0) return { content: [{ type: 'text', text: `Notebook "${id}" not found.` }], isError: true };
    return { content: [{ type: 'text', text: `Added page ${pageIndex + 1} to notebook.` }] };
  },
);

server.tool(
  'update_scratchpad',
  "Replace a notebook's scratchpad content.",
  {
    id: z.string().describe('Notebook/project ID'),
    content: z.string().describe('New scratchpad content'),
  },
  async ({ id, content }) => {
    const project = store.getProject(id);
    if (!project) return { content: [{ type: 'text', text: `Notebook "${id}" not found.` }], isError: true };
    store.saveScratchpad(id, content);
    return { content: [{ type: 'text', text: `Updated scratchpad for "${project.meta.title ?? 'untitled'}".` }] };
  },
);

server.tool(
  'rename_project',
  'Rename a notebook.',
  {
    id: z.string().describe('Notebook/project ID'),
    title: z.string().describe('New title'),
  },
  async ({ id, title }) => {
    const project = store.getProject(id);
    if (!project) return { content: [{ type: 'text', text: `Notebook "${id}" not found.` }], isError: true };
    store.renameProject(id, title);
    return { content: [{ type: 'text', text: `Renamed notebook to "${title}".` }] };
  },
);

server.tool(
  'delete_project',
  'Delete a notebook and all its pages.',
  { id: z.string().describe('Notebook/project ID') },
  async ({ id }) => {
    const project = store.getProject(id);
    if (!project) return { content: [{ type: 'text', text: `Notebook "${id}" not found.` }], isError: true };
    const title = project.meta.title ?? 'untitled';
    store.deleteProject(id);
    return { content: [{ type: 'text', text: `Deleted notebook "${title}".` }] };
  },
);

server.tool(
  'search_notes',
  'Search across all notebooks, pages, and scratchpads for a query.',
  { query: z.string().describe('Search query') },
  async ({ query }) => {
    const results = store.searchNotes(query);
    if (results.length === 0) {
      return { content: [{ type: 'text', text: `No results for "${query}".` }] };
    }
    const lines = results.map((r) => {
      const location = r.pageIndex >= 0 ? `page ${r.pageIndex + 1}` : 'scratchpad';
      const matches = r.lineMatches.length ? r.lineMatches.slice(0, 5).map((l) => `  → ${l.trim()}`).join('\n') : '';
      const scratchMatches = r.scratchpadMatches?.length ? r.scratchpadMatches.slice(0, 5).map((l) => `  → ${l.trim()}`).join('\n') : '';
      return `"${r.projectTitle}" (${location}):\n${matches}${scratchMatches}`;
    });
    return { content: [{ type: 'text', text: lines.join('\n\n') }] };
  },
);

server.tool(
  'append_to_page',
  'Append text to the end of a specific page in a notebook.',
  {
    id: z.string().describe('Notebook/project ID'),
    page: z.number().int().min(1).describe('Page number (1-indexed)'),
    content: z.string().describe('Text to append'),
  },
  async ({ id, page, content }) => {
    const current = store.getPage(id, page - 1);
    if (current === null) return { content: [{ type: 'text', text: `Page ${page} not found in notebook "${id}".` }], isError: true };
    store.updatePage(id, page - 1, current + (current && !current.endsWith('\n') ? '\n' : '') + content);
    const project = store.getProject(id);
    return { content: [{ type: 'text', text: `Appended to page ${page} of "${project?.meta.title ?? 'untitled'}".` }] };
  },
);

server.tool(
  'append_to_scratchpad',
  "Append text to a notebook's scratchpad.",
  {
    id: z.string().describe('Notebook/project ID'),
    content: z.string().describe('Text to append'),
  },
  async ({ id, content }) => {
    const current = store.getScratchpad(id);
    if (current === null) return { content: [{ type: 'text', text: `Notebook "${id}" not found.` }], isError: true };
    store.saveScratchpad(id, current + (current && !current.endsWith('\n') ? '\n' : '') + content);
    const project = store.getProject(id);
    return { content: [{ type: 'text', text: `Appended to scratchpad of "${project?.meta.title ?? 'untitled'}".` }] };
  },
);

// ---- HTTP Server (MCP Streamable HTTP + REST API + WebSocket) ----

async function main() {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });
  await server.connect(transport);

  const httpServer = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost`);
    if (url.pathname === MCP_PATH) {
      await transport.handleRequest(req, res);
    }
  });

  // Attach REST API + WebSocket (routes /api/* and /ws)
  const { attachRestAndWs } = await import('./http.js');
  attachRestAndWs(httpServer, store);

  httpServer.listen(HTTP_PORT, () => {
    console.log(``);
    console.log(`  ✦ ezwrite MCP server running`);
    console.log(``);
    console.log(`  Paste this URL into your LLM's MCP settings:`);
    console.log(``);
    console.log(`  http://localhost:${HTTP_PORT}${MCP_PATH}`);
    console.log(``);
    console.log(`  REST API: http://localhost:${HTTP_PORT}/api`);
    console.log(`  WebSocket: ws://localhost:${HTTP_PORT}/ws`);
    console.log(``);
  });
}

main().catch((err) => {
  console.error('[ezwrite-mcp] Fatal:', err);
  process.exit(1);
});
