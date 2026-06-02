import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      const resolved = path.join(process.cwd(), 'src', `${specifier.slice(2)}.ts`);
      return {
        url: pathToFileURL(resolved).href,
        shortCircuit: true,
      };
    }
    if (specifier.startsWith('./') || specifier.startsWith('../')) {
      const parentDir = path.dirname(fileURLToPath(context.parentURL));
      const base = path.join(parentDir, specifier);
      const candidate = base.endsWith('.ts') ? base : `${base}.ts`;
      return {
        url: pathToFileURL(candidate).href,
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});

const {
  createProject,
  createProjectWithId,
  getActiveProjectId,
  getProjectMeta,
  getProjectPages,
  getProjectScratchpad,
  getProjectTitle,
  initProjects,
  listProjects,
  renameProjectTitle,
  saveProjectScratchpad,
  saveProjectSnapshot,
  saveProjectPages,
} = await import('./projects.ts');

const {
  WELCOME_PROJECT_ID,
  WELCOME_PROJECT_TITLE,
  WELCOME_ROLLOUT_KEY,
  WELCOME_ROLLOUT_VERSION,
} = await import('./welcome-notebook.ts');

class LocalStorageMock {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, String(value));
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  clear(): void {
    this.values.clear();
  }
}

const localStorageMock = new LocalStorageMock();
Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  configurable: true,
});

test.beforeEach(() => {
  localStorageMock.clear();
});

test('notebook title stays independent from first editor line', () => {
  initProjects();
  const project = createProject('');

  saveProjectPages(project.id, ['draft title\nbody']);

  assert.equal(getProjectTitle(project.id), 'untitled');
  assert.deepEqual(getProjectPages(project.id), ['draft title\nbody']);
});

test('legacy content-derived titles are stored once and stop following editor edits', () => {
  const project = createProject('legacy title\nbody');

  initProjects();
  saveProjectPages(project.id, ['changed first line\nbody']);

  assert.equal(getProjectTitle(project.id), 'legacy title');
});

test('renaming a notebook does not write the title into editor content', () => {
  initProjects();
  const project = createProject('');

  renameProjectTitle(project.id, 'research notes');

  assert.equal(getProjectTitle(project.id), 'research notes');
  assert.deepEqual(getProjectPages(project.id), ['']);
});

test('welcome rollout delivers demo notebook to existing users', () => {
  createProject('my private notes');
  initProjects();

  assert.equal(listProjects().some((project) => project.id === WELCOME_PROJECT_ID), true);
  assert.equal(getProjectTitle(WELCOME_PROJECT_ID), WELCOME_PROJECT_TITLE);
  assert.ok(getProjectPages(WELCOME_PROJECT_ID).length >= 10);
  assert.equal(getActiveProjectId(), WELCOME_PROJECT_ID);
  assert.equal(localStorageMock.getItem(WELCOME_ROLLOUT_KEY), WELCOME_ROLLOUT_VERSION);
});

test('initProjects removes redundant conflict notebooks when their stored content matches the base notebook', () => {
  initProjects();
  createProjectWithId('shared', 'hi.\ni am evan.', { title: 'hi.', updatedAt: 10 });
  saveProjectScratchpad('shared', 'side');
  saveProjectSnapshot({
    id: 'shared-conflict-abc123',
    title: 'hi. conflict',
    pages: ['hi.\ni am evan.'],
    scratchpad: 'side',
    updatedAt: 20,
    syncEnabled: false,
  });

  initProjects();

  assert.equal(getProjectMeta('shared-conflict-abc123'), null);
  assert.deepEqual(getProjectPages('shared'), ['hi.\ni am evan.']);
  assert.equal(getProjectScratchpad('shared'), 'side');
});

test('initProjects keeps conflict notebooks when their stored content differs from the base notebook', () => {
  initProjects();
  createProjectWithId('shared', 'hi.\ni am evan.', { title: 'hi.', updatedAt: 10 });
  saveProjectSnapshot({
    id: 'shared-conflict-abc123',
    title: 'hi. conflict',
    pages: ['hi.\nif it solely were up to me to decid…'],
    scratchpad: '',
    updatedAt: 20,
    syncEnabled: false,
  });

  initProjects();

  assert.notEqual(getProjectMeta('shared-conflict-abc123'), null);
});
