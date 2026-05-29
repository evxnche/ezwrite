import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { Store } from './store.js';

const MCP_PATH = '/mcp';
const HTTP_PORT = parseInt(process.env.EZWRITE_MCP_PORT ?? '3157', 10);

const store = new Store(process.env.EZWRITE_EXPORT_DIR);

// --- Token helpers ---

function getTokenFromUrl(req: { url?: string }): string | null {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    return url.searchParams.get('token');
  } catch {
    return null;
  }
}

function getDataDirFromToken(token: string): string | null {
  return store.getDataDir(token);
}

// --- MCP Server ---

const server = new McpServer({
  name: 'ezwrite',
  version: '0.1.0',
});

// We need the token in every tool handler. Since MCP tool handlers don't receive
// the request directly, we store the current token in a request-scoped variable.
// StreamableHTTP transport handles one request at a time per session, so this is safe.
let currentToken: string | null = null;

function requireToken<T extends Record<string, unknown>>(
  handler: (token: string, args: T) => ReturnType<Parameters<typeof server.tool>[3]>
): (args: T) => ReturnType<Parameters<typeof server.tool>[3]> {
  return (args) => {
    if (!currentToken) {
      return Promise.resolve({ content: [{ type: 'text', text: 'No token. Use /mcp?token=YOUR_TOKEN' }], isError: true });
    }
    if (!store.validateToken(currentToken)) {
      return Promise.resolve({ content: [{ type: 'text', text: 'Invalid token. Your ezwrite folder may not be found. Make sure you\'ve picked a save folder and enabled MCP sync.' }], isError: true });
    }
    return handler(currentToken, args);
  };
}

// ---- Project tools ----

server.tool(
  'list_projects',
  'List all ezwrite notebooks with their titles, creation dates, and page counts.',
  {},
  requireToken(async (token) => {
    const projects = store.listProjects(token);
    const lines = projects.map((p) => {
      const data = store.getProject(token, p.id);
      const pages = data ? data.pages.length : 0;
      return `- [${p.id}] "${p.title ?? 'untitled'}" (${pages} page${pages !== 1 ? 's' : ''}, updated ${new Date(p.updatedAt).toLocaleString()})`;
    });
    return {
      content: [{ type: 'text', text: lines.length ? lines.join('\n') : 'No notebooks found.' }],
    };
  }),
);

server.tool(
  'get_project',
  'Get full details of a notebook: all page contents (markdown) and scratchpad.',
  { id: z.string().describe('Notebook/project ID') },
  requireToken(async (token, { id }) => {
    const project = store.getProject(token, id);
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
  }),
);

server.tool(
  'get_page',
  'Get the content of a specific page in a notebook (markdown).',
  {
    id: z.string().describe('Notebook/project ID'),
    page: z.number().int().min(1).describe('Page number (1-indexed)'),
  },
  requireToken(async (token, { id, page }) => {
    const content = store.getPage(token, id, page - 1);
    if (content === null) return { content: [{ type: 'text', text: `Page ${page} not found in notebook "${id}".` }], isError: true };
    return { content: [{ type: 'text', text: content }] };
  }),
);

server.tool(
  'get_scratchpad',
  "Get a notebook's scratchpad content (markdown).",
  { id: z.string().describe('Notebook/project ID') },
  requireToken(async (token, { id }) => {
    const content = store.getScratchpad(token, id);
    if (content === null) return { content: [{ type: 'text', text: `Notebook "${id}" not found.` }], isError: true };
    return { content: [{ type: 'text', text: content || '(scratchpad is empty)' }] };
  }),
);

server.tool(
  'create_project',
  'Create a new notebook with an optional title and first page content (markdown).',
  {
    title: z.string().optional().describe('Notebook title'),
    content: z.string().optional().describe('First page content (markdown)'),
  },
  requireToken(async (token, { title, content }) => {
    const project = store.createProject(token, content ?? '', title);
    return {
      content: [{ type: 'text', text: `Created notebook "${project.meta.title ?? 'untitled'}" (${project.meta.id})` }],
    };
  }),
);

server.tool(
  'update_page',
  'Replace the content of a specific page in a notebook (markdown).',
  {
    id: z.string().describe('Notebook/project ID'),
    page: z.number().int().min(1).describe('Page number (1-indexed)'),
    content: z.string().describe('New page content (markdown)'),
  },
  requireToken(async (token, { id, page, content }) => {
    const project = store.getProject(token, id);
    if (!project) return { content: [{ type: 'text', text: `Notebook "${id}" not found.` }], isError: true };
    if (page < 1 || page > project.pages.length) {
      return { content: [{ type: 'text', text: `Page ${page} out of range (1–${project.pages.length}).` }], isError: true };
    }
    store.updatePage(token, id, page - 1, content);
    return { content: [{ type: 'text', text: `Updated page ${page} of "${project.meta.title ?? 'untitled'}".` }] };
  }),
);

server.tool(
  'add_page',
  'Add a new page to a notebook.',
  {
    id: z.string().describe('Notebook/project ID'),
    content: z.string().optional().describe('Page content (markdown)'),
  },
  requireToken(async (token, { id, content }) => {
    const pageIndex = store.addPage(token, id, content ?? '');
    if (pageIndex < 0) return { content: [{ type: 'text', text: `Notebook "${id}" not found.` }], isError: true };
    return { content: [{ type: 'text', text: `Added page ${pageIndex + 1} to notebook.` }] };
  }),
);

server.tool(
  'update_scratchpad',
  "Replace a notebook's scratchpad content (markdown).",
  {
    id: z.string().describe('Notebook/project ID'),
    content: z.string().describe('New scratchpad content (markdown)'),
  },
  requireToken(async (token, { id, content }) => {
    const project = store.getProject(token, id);
    if (!project) return { content: [{ type: 'text', text: `Notebook "${id}" not found.` }], isError: true };
    store.saveScratchpad(token, id, content);
    return { content: [{ type: 'text', text: `Updated scratchpad for "${project.meta.title ?? 'untitled'}".` }] };
  }),
);

server.tool(
  'rename_project',
  'Rename a notebook.',
  {
    id: z.string().describe('Notebook/project ID'),
    title: z.string().describe('New title'),
  },
  requireToken(async (token, { id, title }) => {
    const project = store.getProject(token, id);
    if (!project) return { content: [{ type: 'text', text: `Notebook "${id}" not found.` }], isError: true };
    store.renameProject(token, id, title);
    return { content: [{ type: 'text', text: `Renamed notebook to "${title}".` }] };
  }),
);

server.tool(
  'delete_project',
  'Delete a notebook and all its pages.',
  { id: z.string().describe('Notebook/project ID') },
  requireToken(async (token, { id }) => {
    const project = store.getProject(token, id);
    if (!project) return { content: [{ type: 'text', text: `Notebook "${id}" not found.` }], isError: true };
    const title = project.meta.title ?? 'untitled';
    store.deleteProject(token, id);
    return { content: [{ type: 'text', text: `Deleted notebook "${title}".` }] };
  }),
);

server.tool(
  'search_notes',
  'Search across all notebooks, pages, and scratchpads for a query.',
  { query: z.string().describe('Search query') },
  requireToken(async (token, { query }) => {
    const results = store.searchNotes(token, query);
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
  }),
);

server.tool(
  'append_to_page',
  'Append text to the end of a specific page in a notebook.',
  {
    id: z.string().describe('Notebook/project ID'),
    page: z.number().int().min(1).describe('Page number (1-indexed)'),
    content: z.string().describe('Text to append'),
  },
  requireToken(async (token, { id, page, content }) => {
    const current = store.getPage(token, id, page - 1);
    if (current === null) return { content: [{ type: 'text', text: `Page ${page} not found in notebook "${id}".` }], isError: true };
    store.updatePage(token, id, page - 1, current + (current && !current.endsWith('\n') ? '\n' : '') + content);
    const project = store.getProject(token, id);
    return { content: [{ type: 'text', text: `Appended to page ${page} of "${project?.meta.title ?? 'untitled'}".` }] };
  }),
);

server.tool(
  'append_to_scratchpad',
  "Append text to a notebook's scratchpad.",
  {
    id: z.string().describe('Notebook/project ID'),
    content: z.string().describe('Text to append'),
  },
  requireToken(async (token, { id, content }) => {
    const project = store.getProject(token, id);
    if (!project) return { content: [{ type: 'text', text: `Notebook "${id}" not found.` }], isError: true };
    const current = project.scratchpad;
    store.saveScratchpad(token, id, current + (current && !current.endsWith('\n') ? '\n' : '') + content);
    return { content: [{ type: 'text', text: `Appended to scratchpad of "${project.meta.title ?? 'untitled'}".` }] };
  }),
);

// ---- HTTP Server ----

async function main() {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });
  await server.connect(transport);

  const httpServer = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');

    if (url.pathname === MCP_PATH) {
      const token = getTokenFromUrl(req);
      if (!token) {
        res.statusCode = 401;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Missing ?token= parameter. Enable MCP sync in ezwrite to get your URL.' }));
        return;
      }

      // Set the current token for this request's tool handlers
      currentToken = token;
      await transport.handleRequest(req, res);
      currentToken = null;
      return;
    }

    // Diagnostic endpoints
    if (url.pathname === '/') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/plain');
      res.end('ezwrite MCP server is running. Use /mcp?token=... for MCP connection.');
      return;
    }

    if (url.pathname === '/status') {
      const token = url.searchParams.get('token');
      if (!token) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'Missing token' }));
        return;
      }
      const dir = getDataDirFromToken(token);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        ok: !!dir,
        tokenFound: !!dir,
        dataDir: dir,
        message: dir ? 'Token valid. MCP server is ready.' : 'Token not found. Enable MCP sync in ezwrite and pick a save folder.',
      }));
      return;
    }

    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  httpServer.listen(HTTP_PORT, () => {
    console.log('');
    console.log('  ✦ ezwrite MCP server running');
    console.log('');
    console.log('  1. Open ezwrite → Settings → Storage → pick a folder');
    console.log('  2. Toggle AI Sync → Enable MCP Sync');
    console.log('  3. Copy the URL from ezwrite');
    console.log('  4. Paste it into your LLM\'s MCP settings');
    console.log('');
    console.log(`  Status check: http://localhost:${HTTP_PORT}/status?token=YOUR_TOKEN`);
    console.log('');
  });
}

main().catch((err) => {
  console.error('[ezwrite-mcp] Fatal:', err);
  process.exit(1);
});
