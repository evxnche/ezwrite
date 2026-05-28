import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import type { Server, IncomingMessage, ServerResponse } from 'node:http';
import type { Store, ProjectData } from './store.js';

export function attachRestAndWs(httpServer: Server, store: Store) {
  const app = express();
  app.use(express.json());

  // --- REST API for ezwrite frontend ---

  app.get('/api/projects', (_req, res) => {
    res.json(store.listProjects());
  });

  app.get('/api/projects/:id', (req, res) => {
    const project = store.getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Not found' });
    res.json(project);
  });

  app.get('/api/projects/:id/pages/:page', (req, res) => {
    const pageIdx = parseInt(req.params.page, 10);
    const content = store.getPage(req.params.id, pageIdx);
    if (content === null) return res.status(404).json({ error: 'Not found' });
    res.json({ content });
  });

  app.get('/api/projects/:id/scratchpad', (req, res) => {
    const content = store.getScratchpad(req.params.id);
    if (content === null) return res.status(404).json({ error: 'Not found' });
    res.json({ content });
  });

  app.post('/api/projects', (req, res) => {
    const { title, content } = req.body ?? {};
    const project = store.createProject(content ?? '', title);
    res.status(201).json(project);
  });

  app.put('/api/projects/:id/pages', (req, res) => {
    const { pages } = req.body;
    if (!Array.isArray(pages)) return res.status(400).json({ error: 'pages must be an array' });
    store.saveProjectPages(req.params.id, pages);
    res.json({ ok: true });
  });

  app.put('/api/projects/:id/pages/:page', (req, res) => {
    const pageIdx = parseInt(req.params.page, 10);
    const { content } = req.body;
    if (typeof content !== 'string') return res.status(400).json({ error: 'content must be a string' });
    store.updatePage(req.params.id, pageIdx, content);
    res.json({ ok: true });
  });

  app.post('/api/projects/:id/pages', (req, res) => {
    const { content } = req.body;
    const pageIndex = store.addPage(req.params.id, content ?? '');
    if (pageIndex < 0) return res.status(404).json({ error: 'Project not found' });
    res.status(201).json({ pageIndex });
  });

  app.delete('/api/projects/:id/pages/:page', (req, res) => {
    const pageIdx = parseInt(req.params.page, 10);
    store.deletePage(req.params.id, pageIdx);
    res.json({ ok: true });
  });

  app.put('/api/projects/:id/scratchpad', (req, res) => {
    const { content } = req.body;
    if (typeof content !== 'string') return res.status(400).json({ error: 'content must be a string' });
    store.saveScratchpad(req.params.id, content);
    res.json({ ok: true });
  });

  app.put('/api/projects/:id/title', (req, res) => {
    const { title } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });
    store.renameProject(req.params.id, title);
    res.json({ ok: true });
  });

  app.delete('/api/projects/:id', (req, res) => {
    store.deleteProject(req.params.id);
    res.json({ ok: true });
  });

  app.post('/api/import', (req, res) => {
    const { activeProjectId, projects } = req.body;
    if (!Array.isArray(projects)) return res.status(400).json({ error: 'projects must be an array' });
    for (const project of projects) {
      store.importProjectData(project as ProjectData);
    }
    if (typeof activeProjectId === 'string') {
      store.setActiveProjectId(activeProjectId);
    }
    res.json({ ok: true, projectCount: projects.length });
  });

  app.get('/api/snapshot', (_req, res) => {
    res.json(store.getFullSnapshot());
  });

  app.get('/api/search', (req, res) => {
    const q = req.query.q as string;
    if (!q) return res.status(400).json({ error: 'q parameter required' });
    res.json(store.searchNotes(q));
  });

  app.get('/api/active', (_req, res) => {
    res.json({ id: store.getActiveProjectId() });
  });

  app.put('/api/active', (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'id required' });
    store.setActiveProjectId(id);
    res.json({ ok: true });
  });

  // --- Route non-/mcp requests to express ---
  // The /mcp path is handled by the original createServer callback.
  // We add express as an additional listener for everything else.
  httpServer.on('request', (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://localhost`);
    if (url.pathname === '/mcp') return; // already handled
    app(req, res);
  });

  // --- WebSocket ---
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'init', data: store.getFullSnapshot() }));

    const unsubscribe = store.onChange(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'update', data: store.getFullSnapshot() }));
      }
    });

    ws.on('close', unsubscribe);
    ws.on('error', unsubscribe);
  });
}
