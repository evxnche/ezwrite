import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
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
    return nextResolve(specifier, context);
  },
});

const {
  createProject,
  getProjectPages,
  getProjectTitle,
  initProjects,
  renameProjectTitle,
  saveProjectPages,
} = await import('./projects.ts');

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
