import {
  readdirSync, readFileSync, writeFileSync, existsSync,
  mkdirSync, statSync, watch, rmSync, renameSync,
} from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';

// --- Types ---

export interface ProjectMeta {
  id: string;
  title?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectData {
  meta: ProjectMeta;
  pages: string[];      // markdown content
  scratchpad: string;   // markdown content
}

// --- Token ---

const MCP_CONFIG_FILE = 'mcp.json';
const EZWRITE_MARKER_DIR = '.ezwrite';

interface McpConfig {
  token: string;
  createdAt: number;
}

function generateToken(): string {
  return randomUUID();
}

function loadMcpConfig(dir: string): McpConfig | null {
  const path = join(dir, EZWRITE_MARKER_DIR, MCP_CONFIG_FILE);
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw);
    if (typeof parsed.token === 'string') return parsed as McpConfig;
  } catch { /* */ }
  return null;
}

function saveMcpConfig(dir: string, config: McpConfig): void {
  const markerDir = join(dir, EZWRITE_MARKER_DIR);
  if (!existsSync(markerDir)) mkdirSync(markerDir, { recursive: true });
  writeFileSync(join(markerDir, MCP_CONFIG_FILE), JSON.stringify(config, null, 2), 'utf-8');
}

// --- Directory discovery ---

const COMMON_PARENTS = [
  join(homedir(), 'Documents'),
  join(homedir(), 'Desktop'),
  homedir(),
  join(homedir(), 'ezwrite-data'),
];

function findExportDirectory(): string | null {
  // 1. Env var override
  const envDir = process.env.EZWRITE_EXPORT_DIR;
  if (envDir && existsSync(envDir)) {
    const configPath = join(envDir, EZWRITE_MARKER_DIR, MCP_CONFIG_FILE);
    if (existsSync(configPath)) return envDir;
  }

  // 2. Scan common parents for .ezwrite/mcp.json
  for (const parent of COMMON_PARENTS) {
    if (!existsSync(parent)) continue;
    try {
      const entries = readdirSync(parent, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const candidate = join(parent, entry.name);
        const configPath = join(candidate, EZWRITE_MARKER_DIR, MCP_CONFIG_FILE);
        if (existsSync(configPath)) return candidate;
      }
    } catch { /* */ }
  }

  // 3. Default directory
  const defaultDir = join(homedir(), 'ezwrite-data');
  if (!existsSync(defaultDir)) mkdirSync(defaultDir, { recursive: true });
  return defaultDir;
}

// --- Store ---

export class Store {
  private dataDir: string;
  private token: string;
  private listeners: Set<() => void> = new Set();
  private watcher: ReturnType<typeof watch> | null = null;

  constructor(explicitDir?: string) {
    this.dataDir = explicitDir ?? findExportDirectory() ?? join(homedir(), 'ezwrite-data');
    if (!existsSync(this.dataDir)) mkdirSync(this.dataDir, { recursive: true });

    // Token: load existing or generate new
    const config = loadMcpConfig(this.dataDir);
    if (config) {
      this.token = config.token;
    } else {
      this.token = generateToken();
      saveMcpConfig(this.dataDir, { token: this.token, createdAt: Date.now() });
    }

    // Watch for external changes
    this.startWatcher();
  }

  getDataDir(): string { return this.dataDir; }
  getToken(): string { return this.token; }

  // --- Projects ---

  listProjects(): ProjectMeta[] {
    const projects: ProjectMeta[] = [];
    try {
      const entries = readdirSync(this.dataDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith('.')) continue;
        const metaPath = join(this.dataDir, entry.name, 'project.json');
        if (!existsSync(metaPath)) continue;
        try {
          const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
          projects.push({
            id: meta.id ?? entry.name,
            title: meta.title,
            createdAt: meta.createdAt ?? 0,
            updatedAt: meta.updatedAt ?? 0,
          });
        } catch { /* */ }
      }
    } catch { /* */ }
    return projects.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  getProject(id: string): ProjectData | null {
    const dir = join(this.dataDir, id);
    if (!existsSync(dir)) return null;

    let meta: ProjectMeta = { id, createdAt: 0, updatedAt: 0 };
    try {
      const raw = readFileSync(join(dir, 'project.json'), 'utf-8');
      const parsed = JSON.parse(raw);
      meta = {
        id: parsed.id ?? id,
        title: parsed.title,
        createdAt: parsed.createdAt ?? 0,
        updatedAt: parsed.updatedAt ?? 0,
      };
    } catch { /* */ }

    const pages = this.readPages(dir);
    const scratchpad = this.readScratchpad(dir);

    return { meta, pages, scratchpad };
  }

  private readPages(dir: string): string[] {
    const pages: string[] = [];
    let i = 0;
    while (true) {
      const fileName = `page-${String(i + 1).padStart(3, '0')}.md`;
      const path = join(dir, fileName);
      if (!existsSync(path)) break;
      try {
        pages.push(readFileSync(path, 'utf-8'));
      } catch {
        pages.push('');
      }
      i++;
    }
    return pages.length ? pages : [''];
  }

  private readScratchpad(dir: string): string {
    const path = join(dir, 'scratchpad.md');
    if (!existsSync(path)) return '';
    try {
      return readFileSync(path, 'utf-8');
    } catch { return ''; }
  }

  // --- Write ---

  createProject(firstPageContent = '', title?: string): ProjectData {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const now = Date.now();
    const dir = join(this.dataDir, id);
    mkdirSync(dir, { recursive: true });

    const meta: ProjectMeta = {
      id,
      title: title?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };

    writeFileSync(join(dir, 'project.json'), JSON.stringify({
      id,
      title: meta.title ?? getProjectTitleFromMarkdown([firstPageContent]),
      pageCount: 1,
      hasScratchpad: false,
      updatedAt: now,
    }, null, 2), 'utf-8');

    writeFileSync(join(dir, 'page-001.md'), firstPageContent || '', 'utf-8');

    return { meta, pages: [firstPageContent || ''], scratchpad: '' };
  }

  updatePage(id: string, pageIndex: number, content: string): void {
    const dir = join(this.dataDir, id);
    if (!existsSync(dir)) return;

    const fileName = `page-${String(pageIndex + 1).padStart(3, '0')}.md`;
    writeFileSync(join(dir, fileName), content, 'utf-8');
    this.touchProjectMeta(id);
  }

  addPage(id: string, content = ''): number {
    const dir = join(this.dataDir, id);
    if (!existsSync(dir)) return -1;

    const pages = this.readPages(dir);
    const newIndex = pages.length;
    const fileName = `page-${String(newIndex + 1).padStart(3, '0')}.md`;
    writeFileSync(join(dir, fileName), content, 'utf-8');

    // Update meta
    try {
      const metaPath = join(dir, 'project.json');
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
      meta.pageCount = newIndex + 1;
      meta.updatedAt = Date.now();
      writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
    } catch { /* */ }

    return newIndex;
  }

  deletePage(id: string, pageIndex: number): void {
    const dir = join(this.dataDir, id);
    if (!existsSync(dir)) return;

    const pages = this.readPages(dir);
    if (pages.length <= 1) return;
    if (pageIndex < 0 || pageIndex >= pages.length) return;

    // Remove the file
    const fileName = `page-${String(pageIndex + 1).padStart(3, '0')}.md`;
    try { rmSync(join(dir, fileName)); } catch { /* */ }

    // Rename subsequent pages down
    for (let i = pageIndex + 1; i < pages.length; i++) {
      const oldName = `page-${String(i + 1).padStart(3, '0')}.md`;
      const newName = `page-${String(i).padStart(3, '0')}.md`;
      try { renameSync(join(dir, oldName), join(dir, newName)); } catch { /* */ }
    }

    // Update meta
    try {
      const metaPath = join(dir, 'project.json');
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
      meta.pageCount = pages.length - 1;
      meta.updatedAt = Date.now();
      writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
    } catch { /* */ }
  }

  saveScratchpad(id: string, value: string): void {
    const dir = join(this.dataDir, id);
    if (!existsSync(dir)) return;
    writeFileSync(join(dir, 'scratchpad.md'), value, 'utf-8');

    try {
      const metaPath = join(dir, 'project.json');
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
      meta.hasScratchpad = Boolean(value.trim());
      meta.updatedAt = Date.now();
      writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
    } catch { /* */ }
  }

  renameProject(id: string, newTitle: string): void {
    const dir = join(this.dataDir, id);
    if (!existsSync(dir)) return;
    const cleaned = newTitle.trim();
    if (!cleaned) return;

    try {
      const metaPath = join(dir, 'project.json');
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
      meta.title = cleaned;
      meta.updatedAt = Date.now();
      writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
    } catch { /* */ }
  }

  deleteProject(id: string): void {
    const dir = join(this.dataDir, id);
    if (!existsSync(dir)) return;
    try { rmSync(dir, { recursive: true }); } catch { /* */ }
  }

  // --- Search ---

  searchNotes(query: string): Array<{ projectId: string; projectTitle: string; pageIndex: number; lineMatches: string[]; scratchpadMatches?: string[] }> {
    const results: Array<{ projectId: string; projectTitle: string; pageIndex: number; lineMatches: string[]; scratchpadMatches?: string[] }> = [];
    const q = query.toLowerCase();

    for (const meta of this.listProjects()) {
      const project = this.getProject(meta.id);
      if (!project) continue;
      let hasMatch = false;

      for (let i = 0; i < project.pages.length; i++) {
        const lines = project.pages[i].split('\n');
        const lineMatches = lines.filter((line) => line.toLowerCase().includes(q));
        if (lineMatches.length > 0) {
          results.push({ projectId: meta.id, projectTitle: meta.title ?? 'untitled', pageIndex: i, lineMatches });
          hasMatch = true;
        }
      }

      if (!hasMatch && project.scratchpad.toLowerCase().includes(q)) {
        const lines = project.scratchpad.split('\n');
        const scratchpadMatches = lines.filter((line) => line.toLowerCase().includes(q));
        results.push({ projectId: meta.id, projectTitle: meta.title ?? 'untitled', pageIndex: -1, lineMatches: [], scratchpadMatches });
      }
    }

    return results;
  }

  // --- Helpers ---

  private touchProjectMeta(id: string): void {
    const dir = join(this.dataDir, id);
    if (!existsSync(dir)) return;
    try {
      const metaPath = join(dir, 'project.json');
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
      meta.updatedAt = Date.now();
      writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
    } catch { /* */ }
  }

  // --- Watch ---

  private startWatcher(): void {
    try {
      this.watcher = watch(this.dataDir, { recursive: true }, (_event, filename) => {
        if (typeof filename === 'string' && filename.includes(EZWRITE_MARKER_DIR)) return;
        this.notifyListeners();
      });
    } catch { /* */ }
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) listener();
  }
}

function getProjectTitleFromMarkdown(markdowns: string[]): string {
  const first = markdowns[0] ?? '';
  for (const line of first.split('\n')) {
    const clean = line.trim();
    if (clean) return clean.replace(/^#+\s*/, '').replace(/^>\s*/, '').slice(0, 120);
  }
  return 'untitled';
}
