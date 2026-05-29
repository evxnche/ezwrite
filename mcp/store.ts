import {
  readdirSync, readFileSync, writeFileSync, existsSync,
  mkdirSync, rmSync, renameSync,
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
  pages: string[];
  scratchpad: string;
}

interface McpConfig {
  token: string;
  createdAt: number;
}

// --- Discovery ---

const MCP_CONFIG_FILE = 'mcp.json';
const EZWRITE_MARKER_DIR = '.ezwrite';

const COMMON_PARENTS = [
  join(homedir(), 'Documents'),
  join(homedir(), 'Desktop'),
  homedir(),
  join(homedir(), 'ezwrite-data'),
];

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

/** Scan for ALL .ezwrite/mcp.json files and return a map of token → directory. */
function discoverTokens(): Map<string, string> {
  const map = new Map<string, string>();
  const scanned = new Set<string>();

  for (const parent of COMMON_PARENTS) {
    if (!existsSync(parent)) continue;
    try {
      const entries = readdirSync(parent, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
        const candidate = join(parent, entry.name);
        if (scanned.has(candidate)) continue;
        scanned.add(candidate);
        const config = loadMcpConfig(candidate);
        if (config) map.set(config.token, candidate);
      }
    } catch { /* */ }
  }

  return map;
}

/** Find the directory for a given token. Re-scans each time so picks are always found. */
function findDirForToken(token: string, explicitDir?: string): string | null {
  // 1. Explicit dir override
  if (explicitDir && existsSync(explicitDir)) {
    const config = loadMcpConfig(explicitDir);
    if (config?.token === token) return explicitDir;
  }

  // 2. Scan all known locations
  const map = discoverTokens();
  const dir = map.get(token);
  if (dir) return dir;

  return null;
}

// --- Store ---

export class Store {
  private explicitDir?: string;

  constructor(explicitDir?: string) {
    this.explicitDir = explicitDir;
  }

  private getDir(token: string): string | null {
    return findDirForToken(token, this.explicitDir);
  }

  private readProjectDir(dir: string): ProjectData | null {
    if (!existsSync(dir)) return null;

    let meta: ProjectMeta = { id: basename(dir), createdAt: 0, updatedAt: 0 };
    try {
      const raw = readFileSync(join(dir, 'project.json'), 'utf-8');
      const parsed = JSON.parse(raw);
      meta = {
        id: parsed.id ?? basename(dir),
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
      } catch { pages.push(''); }
      i++;
    }
    return pages.length ? pages : [''];
  }

  private readScratchpad(dir: string): string {
    const path = join(dir, 'scratchpad.md');
    if (!existsSync(path)) return '';
    try { return readFileSync(path, 'utf-8'); } catch { return ''; }
  }

  // --- Public API (token-scoped) ---

  validateToken(token: string): boolean {
    return this.getDir(token) !== null;
  }

  getDataDir(token: string): string | null {
    return this.getDir(token);
  }

  listProjects(token: string): ProjectMeta[] {
    const dir = this.getDir(token);
    if (!dir) return [];

    const projects: ProjectMeta[] = [];
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
        const projectDir = join(dir, entry.name);
        const metaPath = join(projectDir, 'project.json');
        if (!existsSync(metaPath)) continue;
        try {
          const raw = readFileSync(metaPath, 'utf-8');
          const parsed = JSON.parse(raw);
          projects.push({
            id: parsed.id ?? entry.name,
            title: parsed.title,
            createdAt: parsed.createdAt ?? 0,
            updatedAt: parsed.updatedAt ?? 0,
          });
        } catch { /* */ }
      }
    } catch { /* */ }
    return projects.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  getProject(token: string, id: string): ProjectData | null {
    const dir = this.getDir(token);
    if (!dir) return null;
    const projectDir = join(dir, id);
    return this.readProjectDir(projectDir);
  }

  getPage(token: string, id: string, pageIndex: number): string | null {
    const dir = this.getDir(token);
    if (!dir) return null;
    const projectDir = join(dir, id);
    const pages = this.readPages(projectDir);
    if (pageIndex < 0 || pageIndex >= pages.length) return null;
    return pages[pageIndex];
  }

  getScratchpad(token: string, id: string): string | null {
    const dir = this.getDir(token);
    if (!dir) return null;
    const projectDir = join(dir, id);
    return this.readScratchpad(projectDir);
  }

  createProject(token: string, firstPageContent = '', title?: string): ProjectData {
    const dir = this.getDir(token);
    if (!dir) throw new Error('No data directory found for this token');

    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const now = Date.now();
    const projectDir = join(dir, id);
    mkdirSync(projectDir, { recursive: true });

    const meta: ProjectMeta = {
      id,
      title: title?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };

    writeFileSync(join(projectDir, 'project.json'), JSON.stringify({
      id,
      title: meta.title ?? getTitleFromText(firstPageContent),
      pageCount: 1,
      hasScratchpad: false,
      updatedAt: now,
    }, null, 2), 'utf-8');

    writeFileSync(join(projectDir, 'page-001.md'), firstPageContent || '', 'utf-8');

    return { meta, pages: [firstPageContent || ''], scratchpad: '' };
  }

  updatePage(token: string, id: string, pageIndex: number, content: string): void {
    const dir = this.getDir(token);
    if (!dir) return;
    const projectDir = join(dir, id);
    if (!existsSync(projectDir)) return;

    const fileName = `page-${String(pageIndex + 1).padStart(3, '0')}.md`;
    writeFileSync(join(projectDir, fileName), content, 'utf-8');
    this.touchMeta(projectDir);
  }

  addPage(token: string, id: string, content = ''): number {
    const dir = this.getDir(token);
    if (!dir) return -1;
    const projectDir = join(dir, id);
    if (!existsSync(projectDir)) return -1;

    const pages = this.readPages(projectDir);
    const newIndex = pages.length;
    const fileName = `page-${String(newIndex + 1).padStart(3, '0')}.md`;
    writeFileSync(join(projectDir, fileName), content, 'utf-8');

    try {
      const metaPath = join(projectDir, 'project.json');
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
      meta.pageCount = newIndex + 1;
      meta.updatedAt = Date.now();
      writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
    } catch { /* */ }

    return newIndex;
  }

  deletePage(token: string, id: string, pageIndex: number): void {
    const dir = this.getDir(token);
    if (!dir) return;
    const projectDir = join(dir, id);
    if (!existsSync(projectDir)) return;

    const pages = this.readPages(projectDir);
    if (pages.length <= 1) return;
    if (pageIndex < 0 || pageIndex >= pages.length) return;

    const fileName = `page-${String(pageIndex + 1).padStart(3, '0')}.md`;
    try { rmSync(join(projectDir, fileName)); } catch { /* */ }

    for (let i = pageIndex + 1; i < pages.length; i++) {
      const oldName = `page-${String(i + 1).padStart(3, '0')}.md`;
      const newName = `page-${String(i).padStart(3, '0')}.md`;
      try { renameSync(join(projectDir, oldName), join(projectDir, newName)); } catch { /* */ }
    }

    try {
      const metaPath = join(projectDir, 'project.json');
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
      meta.pageCount = pages.length - 1;
      meta.updatedAt = Date.now();
      writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
    } catch { /* */ }
  }

  saveScratchpad(token: string, id: string, value: string): void {
    const dir = this.getDir(token);
    if (!dir) return;
    const projectDir = join(dir, id);
    if (!existsSync(projectDir)) return;
    writeFileSync(join(projectDir, 'scratchpad.md'), value, 'utf-8');

    try {
      const metaPath = join(projectDir, 'project.json');
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
      meta.hasScratchpad = Boolean(value.trim());
      meta.updatedAt = Date.now();
      writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
    } catch { /* */ }
  }

  renameProject(token: string, id: string, newTitle: string): void {
    const dir = this.getDir(token);
    if (!dir) return;
    const projectDir = join(dir, id);
    if (!existsSync(projectDir)) return;
    const cleaned = newTitle.trim();
    if (!cleaned) return;

    try {
      const metaPath = join(projectDir, 'project.json');
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
      meta.title = cleaned;
      meta.updatedAt = Date.now();
      writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
    } catch { /* */ }
  }

  deleteProject(token: string, id: string): void {
    const dir = this.getDir(token);
    if (!dir) return;
    const projectDir = join(dir, id);
    if (!existsSync(projectDir)) return;
    try { rmSync(projectDir, { recursive: true }); } catch { /* */ }
  }

  searchNotes(token: string, query: string): Array<{ projectId: string; projectTitle: string; pageIndex: number; lineMatches: string[]; scratchpadMatches?: string[] }> {
    const results: Array<{ projectId: string; projectTitle: string; pageIndex: number; lineMatches: string[]; scratchpadMatches?: string[] }> = [];
    const q = query.toLowerCase();

    for (const meta of this.listProjects(token)) {
      const project = this.getProject(token, meta.id);
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

  private touchMeta(projectDir: string): void {
    try {
      const metaPath = join(projectDir, 'project.json');
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
      meta.updatedAt = Date.now();
      writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
    } catch { /* */ }
  }
}

function getTitleFromText(text: string): string {
  for (const line of text.split('\n')) {
    const clean = line.trim();
    if (clean) return clean.replace(/^#+\s*/, '').replace(/^>\s*/, '').slice(0, 120);
  }
  return 'untitled';
}
