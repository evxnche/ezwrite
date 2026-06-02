// Project data layer — each project/doc contains its own set of pages.
// localStorage keys:
//   ezwrite-projects         → ProjectMeta[] (ordered list)
//   ezwrite-active-project   → string (active project id)
//   ezwrite-project-{id}     → string[] (pages)
//   ezwrite-project-{id}-bak → string[] (last known good pages)
//   ezwrite-project-{id}-ts  → number[] (page timestamps)
//   ezwrite-project-{id}-lp  → number (last viewed page index)

import { stripLegacyImageLines } from '@/components/writing-helpers';
import {
  WELCOME_PROJECT_ID,
  WELCOME_PROJECT_PAGES,
  WELCOME_PROJECT_TITLE,
  WELCOME_ROLLOUT_KEY,
  WELCOME_ROLLOUT_VERSION,
} from './welcome-notebook';

export interface ProjectMeta {
  id: string;
  title?: string;
  createdAt: number;
  updatedAt: number;
  syncEnabled?: boolean;
  syncLastRemoteUpdatedAt?: number;
  syncLastPushedAt?: number;
  syncLastPulledAt?: number;
  syncLastPayloadHash?: string;
}

const PROJECTS_KEY = 'ezwrite-projects';
const ACTIVE_KEY = 'ezwrite-active-project';

function projectPagesKey(id: string) { return `ezwrite-project-${id}`; }
function projectPagesBackupKey(id: string) { return `ezwrite-project-${id}-bak`; }
function projectTimestampsKey(id: string) { return `ezwrite-project-${id}-ts`; }
function projectLastPageKey(id: string) { return `ezwrite-project-${id}-lp`; }
function projectScratchpadKey(id: string) { return `ezwrite-project-${id}-scratchpad`; }
function projectScratchpadBackupKey(id: string) { return `ezwrite-project-${id}-scratchpad-bak`; }

function normalizePages(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  return value.map((page) => stripLegacyImageLines(String(page ?? '')));
}

function parsePages(raw: string | null): string[] | null {
  if (!raw) return null;
  try {
    return normalizePages(JSON.parse(raw));
  } catch {
    return null;
  }
}

function saveLastKnownGoodPages(id: string): void {
  const current = localStorage.getItem(projectPagesKey(id));
  if (parsePages(current)) {
    localStorage.setItem(projectPagesBackupKey(id), current!);
  }
}

function saveProjects(projects: ProjectMeta[]): void {
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
}

export function promoteProjectToFront(id: string): void {
  const projects = listProjects();
  const idx = projects.findIndex((project) => project.id === id);
  if (idx <= 0) return;
  const [project] = projects.splice(idx, 1);
  projects.unshift(project);
  saveProjects(projects);
}

function touchProject(id: string): void {
  const projects = listProjects();
  const idx = projects.findIndex(p => p.id === id);
  if (idx >= 0) {
    projects[idx].updatedAt = Date.now();
    saveProjects(projects);
  }
}

// --- Migration from old flat format ---
function needsMigration(): boolean {
  if (localStorage.getItem(PROJECTS_KEY)) return false;
  return !!localStorage.getItem('zen-writing-pages');
}

function runMigration() {
  const savedPages = localStorage.getItem('zen-writing-pages');
  if (!savedPages) return;

  let pages: string[];
  try {
    const parsed = JSON.parse(savedPages);
    pages = normalizePages(parsed) ?? [''];
  } catch {
    pages = [''];
  }

  // Also grab the old welcome content if no pages existed
  if (pages.length === 1 && !pages[0]) {
    const old = stripLegacyImageLines(localStorage.getItem('zen-writing-content') || '');
    if (old) pages = [old];
  }

  const id = generateId();
  const now = Date.now();

  const meta: ProjectMeta = { id, createdAt: now, updatedAt: now };

  localStorage.setItem(PROJECTS_KEY, JSON.stringify([meta]));
  localStorage.setItem(ACTIVE_KEY, id);
  localStorage.setItem(projectPagesKey(id), JSON.stringify(pages));
  localStorage.setItem(projectPagesBackupKey(id), JSON.stringify(pages));

  // Migrate timestamps
  let timestamps: number[] = [];
  try { timestamps = JSON.parse(localStorage.getItem('ezwrite-page-timestamps') || '[]'); } catch { /* */ }
  localStorage.setItem(projectTimestampsKey(id), JSON.stringify(timestamps));

  // Migrate last page
  const lastPage = localStorage.getItem('ezwrite-last-page');
  if (lastPage) localStorage.setItem(projectLastPageKey(id), lastPage);

  // Clean up old keys
  localStorage.removeItem('zen-writing-pages');
  localStorage.removeItem('zen-writing-content');
  localStorage.removeItem('ezwrite-page-timestamps');
  localStorage.removeItem('ezwrite-last-page');
}

function ensureWelcomeNotebook(): void {
  // Skip welcome notebook on touch devices — mobile sync gate handles onboarding separately
  // and avoids duplicate walkthrough when synced from desktop.
  if (typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches) return;
  if (localStorage.getItem(WELCOME_ROLLOUT_KEY) === WELCOME_ROLLOUT_VERSION) return;

  const now = Date.now();
  const pages = [...WELCOME_PROJECT_PAGES];
  const existing = getProjectMeta(WELCOME_PROJECT_ID);

  if (existing) {
    saveProjectPages(WELCOME_PROJECT_ID, pages);
    saveProjectTimestamps(WELCOME_PROJECT_ID, pages.map(() => now));
    renameProjectTitle(WELCOME_PROJECT_ID, WELCOME_PROJECT_TITLE);
    updateProjectMeta(WELCOME_PROJECT_ID, { updatedAt: now });
    promoteProjectToFront(WELCOME_PROJECT_ID);
  } else {
    createProjectWithId(WELCOME_PROJECT_ID, pages[0] ?? '', {
      title: WELCOME_PROJECT_TITLE,
      createdAt: now,
      updatedAt: now,
    });
    saveProjectPages(WELCOME_PROJECT_ID, pages);
    saveProjectTimestamps(WELCOME_PROJECT_ID, pages.map(() => now));
    saveProjectLastPage(WELCOME_PROJECT_ID, 0);
  }

  setActiveProjectId(WELCOME_PROJECT_ID);
  localStorage.setItem(WELCOME_ROLLOUT_KEY, WELCOME_ROLLOUT_VERSION);
}

function ensureStoredProjectTitles(): void {
  const projects = listProjects();
  let changed = false;
  const nextProjects = projects.map((project) => {
    if (project.title?.trim()) return project;
    const title = pageToTitle(getProjectPages(project.id)[0] ?? '');
    if (!title || title === 'untitled') return project;
    changed = true;
    return { ...project, title };
  });
  if (changed) saveProjects(nextProjects);
}

function pruneRedundantConflictProjects(): void {
  for (const project of listProjects()) {
    const conflictMarker = '-conflict-';
    const markerIndex = project.id.indexOf(conflictMarker);
    if (markerIndex <= 0) continue;

    const baseId = project.id.slice(0, markerIndex);
    const baseProject = getProjectMeta(baseId);
    if (!baseProject) continue;

    const samePages = JSON.stringify(getProjectPages(project.id)) === JSON.stringify(getProjectPages(baseId));
    const sameScratchpad = getProjectScratchpad(project.id) === getProjectScratchpad(baseId);
    if (samePages && sameScratchpad) {
      deleteProject(project.id);
    }
  }
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// --- Public API ---

export function initProjects(): void {
  if (needsMigration()) runMigration();
  ensureStoredProjectTitles();
  pruneRedundantConflictProjects();
  ensureWelcomeNotebook();
}

export function listProjects(): ProjectMeta[] {
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getProjectMeta(id: string): ProjectMeta | null {
  return listProjects().find(p => p.id === id) ?? null;
}

export function updateProjectMeta(id: string, patch: Partial<ProjectMeta>): ProjectMeta | null {
  const projects = listProjects();
  const idx = projects.findIndex(p => p.id === id);
  if (idx < 0) return null;
  projects[idx] = { ...projects[idx], ...patch };
  saveProjects(projects);
  return projects[idx];
}

export function setProjectSyncEnabled(id: string, syncEnabled: boolean): ProjectMeta | null {
  return updateProjectMeta(id, { syncEnabled, updatedAt: Date.now() });
}

export function markProjectSynced(id: string, remoteUpdatedAt: number, localUpdatedAt?: number, payloadHash?: string): ProjectMeta | null {
  const now = Date.now();
  const meta = getProjectMeta(id);
  return updateProjectMeta(id, {
    syncEnabled: true,
    syncLastRemoteUpdatedAt: remoteUpdatedAt,
    syncLastPushedAt: localUpdatedAt ?? meta?.updatedAt ?? now,
    syncLastPulledAt: now,
    ...(payloadHash !== undefined ? { syncLastPayloadHash: payloadHash } : {}),
  });
}

export function getActiveProjectId(): string | null {
  const id = localStorage.getItem(ACTIVE_KEY);
  const projects = listProjects();
  if (id && projects.some(p => p.id === id)) return id;
  // Fallback to first project
  return projects.length > 0 ? projects[0].id : null;
}

export function setActiveProjectId(id: string): void {
  localStorage.setItem(ACTIVE_KEY, id);
}

export function createProject(firstPageContent = '', title?: string): ProjectMeta {
  const id = generateId();
  const now = Date.now();
  const cleanedTitle = title?.trim();
  const meta: ProjectMeta = {
    id,
    createdAt: now,
    updatedAt: now,
    ...(cleanedTitle ? { title: cleanedTitle } : {}),
  };

  const projects = listProjects();
  projects.unshift(meta); // newest first
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
  localStorage.setItem(projectPagesKey(id), JSON.stringify([firstPageContent || '']));
  localStorage.setItem(projectPagesBackupKey(id), JSON.stringify([firstPageContent || '']));
  localStorage.setItem(projectTimestampsKey(id), JSON.stringify([now]));
  localStorage.setItem(projectLastPageKey(id), '0');
  localStorage.setItem(ACTIVE_KEY, id);

  return meta;
}

export function createProjectWithId(id: string, firstPageContent = '', metaPatch: Partial<ProjectMeta> = {}): ProjectMeta {
  const now = Date.now();
  const meta: ProjectMeta = {
    id,
    createdAt: metaPatch.createdAt ?? now,
    updatedAt: metaPatch.updatedAt ?? now,
    title: metaPatch.title,
    syncEnabled: metaPatch.syncEnabled,
    syncLastRemoteUpdatedAt: metaPatch.syncLastRemoteUpdatedAt,
    syncLastPushedAt: metaPatch.syncLastPushedAt,
    syncLastPulledAt: metaPatch.syncLastPulledAt,
    syncLastPayloadHash: metaPatch.syncLastPayloadHash,
  };

  const projects = listProjects().filter((project) => project.id !== id);
  projects.unshift(meta);
  saveProjects(projects);
  localStorage.setItem(projectPagesKey(id), JSON.stringify([firstPageContent || '']));
  localStorage.setItem(projectPagesBackupKey(id), JSON.stringify([firstPageContent || '']));
  localStorage.setItem(projectTimestampsKey(id), JSON.stringify([meta.updatedAt]));
  localStorage.setItem(projectLastPageKey(id), '0');
  localStorage.setItem(ACTIVE_KEY, id);

  return meta;
}

export function deleteProject(id: string): void {
  const projects = listProjects().filter(p => p.id !== id);
  saveProjects(projects);
  localStorage.removeItem(projectPagesKey(id));
  localStorage.removeItem(projectPagesBackupKey(id));
  localStorage.removeItem(projectTimestampsKey(id));
  localStorage.removeItem(projectLastPageKey(id));
  localStorage.removeItem(projectScratchpadKey(id));
  localStorage.removeItem(projectScratchpadBackupKey(id));

  // If deleted project was active, switch to first remaining
  const activeId = localStorage.getItem(ACTIVE_KEY);
  if (activeId === id) {
    if (projects.length > 0) {
      localStorage.setItem(ACTIVE_KEY, projects[0].id);
    } else {
      localStorage.removeItem(ACTIVE_KEY);
    }
  }
}

export function getProjectPages(id: string): string[] {
  return parsePages(localStorage.getItem(projectPagesKey(id)))
    ?? parsePages(localStorage.getItem(projectPagesBackupKey(id)))
    ?? [''];
}

export function saveProjectPages(id: string, pages: string[]): void {
  const safePages = pages.length ? pages.map((page) => String(page ?? '')) : [''];
  saveLastKnownGoodPages(id);
  localStorage.setItem(projectPagesKey(id), JSON.stringify(safePages));
  localStorage.setItem(projectPagesBackupKey(id), JSON.stringify(safePages));
  touchProject(id);
}

export function getProjectTimestamps(id: string): number[] {
  try {
    const raw = localStorage.getItem(projectTimestampsKey(id));
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveProjectTimestamps(id: string, timestamps: number[]): void {
  localStorage.setItem(projectTimestampsKey(id), JSON.stringify(timestamps));
}

export function getProjectLastPage(id: string): number {
  const raw = localStorage.getItem(projectLastPageKey(id));
  if (raw) {
    const n = parseInt(raw, 10);
    if (!isNaN(n) && n >= 0) return n;
  }
  return 0;
}

export function saveProjectLastPage(id: string, page: number): void {
  localStorage.setItem(projectLastPageKey(id), String(page));
}

export function getProjectTitle(id: string): string {
  const metaTitle = listProjects().find(p => p.id === id)?.title?.trim();
  if (metaTitle) return metaTitle;
  return 'untitled';
}

export function renameProjectTitle(id: string, newTitle: string): void {
  const cleaned = newTitle.trim();
  if (!cleaned) return;
  const projects = listProjects();
  const idx = projects.findIndex(p => p.id === id);
  if (idx >= 0) {
    projects[idx] = { ...projects[idx], title: cleaned, updatedAt: Date.now() };
    saveProjects(projects);
  }
}

export function saveProjectSnapshot(input: {
  id: string;
  title?: string;
  pages: string[];
  scratchpad?: string;
  updatedAt?: number;
  syncEnabled?: boolean;
  syncLastRemoteUpdatedAt?: number;
  syncLastPushedAt?: number;
  syncLastPulledAt?: number;
  syncLastPayloadHash?: string;
}): ProjectMeta {
  const safePages = input.pages.length ? input.pages.map((page) => String(page ?? '')) : [''];
  const existing = getProjectMeta(input.id);
  const now = Date.now();
  const metaPatch: Partial<ProjectMeta> = {
    title: input.title?.trim() || undefined,
    updatedAt: input.updatedAt ?? now,
    syncEnabled: input.syncEnabled,
    syncLastRemoteUpdatedAt: input.syncLastRemoteUpdatedAt,
    syncLastPushedAt: input.syncLastPushedAt,
    syncLastPulledAt: input.syncLastPulledAt,
    syncLastPayloadHash: input.syncLastPayloadHash,
  };

  const meta = existing
    ? updateProjectMeta(input.id, metaPatch)!
    : createProjectWithId(input.id, safePages[0] ?? '', {
        ...metaPatch,
        createdAt: input.updatedAt ?? now,
      });

  localStorage.setItem(projectPagesKey(input.id), JSON.stringify(safePages));
  localStorage.setItem(projectPagesBackupKey(input.id), JSON.stringify(safePages));
  if (input.scratchpad !== undefined) {
    localStorage.setItem(projectScratchpadKey(input.id), input.scratchpad);
    localStorage.setItem(projectScratchpadBackupKey(input.id), input.scratchpad);
  }
  return meta;
}

export function getProjectScratchpad(id: string): string {
  return localStorage.getItem(projectScratchpadKey(id))
    ?? localStorage.getItem(projectScratchpadBackupKey(id))
    ?? '';
}

export function saveProjectScratchpad(id: string, value: string): void {
  const current = localStorage.getItem(projectScratchpadKey(id));
  if (current !== null) {
    localStorage.setItem(projectScratchpadBackupKey(id), current);
  }
  localStorage.setItem(projectScratchpadKey(id), value);
  localStorage.setItem(projectScratchpadBackupKey(id), value);
  touchProject(id);
}

export function getProjectPreview(id: string): string {
  const pages = getProjectPages(id);
  const title = pageToTitle(pages[0] ?? '');
  return pageToPreview(pages[0] ?? '', title);
}

// --- Helpers (shared with old NotesPanel logic) ---

import { STRUCK_MARKER, LIST_EXIT, INDENT } from '@/components/writing-helpers';

export function pageToTitle(content: string): string {
  if (!content.trim()) return 'untitled';
  for (const line of content.split('\n')) {
    let clean = line.trim();
    if (!clean || clean === 'list' || clean === 'line' || /^timer(\s|$)/i.test(clean)) continue;
    clean = clean.replace(/^#{1,2}\s+/, '').replace(/^>> ?/, '');
    if (clean.startsWith(STRUCK_MARKER)) clean = clean.slice(STRUCK_MARKER.length);
    if (clean.startsWith(LIST_EXIT)) clean = clean.slice(LIST_EXIT.length);
    clean = clean.startsWith(INDENT) ? clean.replace(/^\s+/, '') : clean;
    if (clean.trim()) return clean.trim();
  }
  return 'untitled';
}

export function pageToPreview(content: string, title: string): string {
  let foundTitle = false;
  for (const line of content.split('\n')) {
    let clean = line.trim();
    if (!clean) continue;
    clean = clean.replace(/^#{1,2}\s+/, '').replace(/^>> ?/, '');
    if (clean === 'list' || clean === 'line' || /^timer(\s|$)/i.test(clean)) continue;
    if (clean.startsWith(STRUCK_MARKER)) clean = clean.slice(STRUCK_MARKER.length);
    if (clean.startsWith(LIST_EXIT)) clean = clean.slice(LIST_EXIT.length);
    clean = clean.startsWith(INDENT) ? clean.replace(/^\s+/, '') : clean;
    clean = clean.trim();
    if (!clean) continue;
    if (!foundTitle && clean === title) { foundTitle = true; continue; }
    return clean;
  }
  return '';
}

export function timeAgo(ts: number): string {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
