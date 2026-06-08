import test from 'node:test';
import assert from 'node:assert/strict';

import {
  decideCanvasMerge,
  canvasHash,
  getCanvasCursor,
  setCanvasCursor,
  getDocSync,
  setDocSync,
  clearDocSync,
} from './agent-canvas-merge.ts';

// --- decideCanvasMerge (the data-safety-critical policy) --------------------

test('a doc that does not exist locally is taken from the agent', () => {
  assert.equal(
    decideCanvasMerge({ hasLocal: false, remoteChanged: true, localChanged: false, hashesEqual: false }),
    'apply-remote',
  );
});

test('an unchanged remote is skipped entirely', () => {
  assert.equal(
    decideCanvasMerge({ hasLocal: true, remoteChanged: false, localChanged: true, hashesEqual: false }),
    'skip',
  );
});

test('remote changed but content already equal only advances bookkeeping', () => {
  assert.equal(
    decideCanvasMerge({ hasLocal: true, remoteChanged: true, localChanged: false, hashesEqual: true }),
    'sync-bookkeeping',
  );
});

test('remote-only change is applied to local', () => {
  assert.equal(
    decideCanvasMerge({ hasLocal: true, remoteChanged: true, localChanged: false, hashesEqual: false }),
    'apply-remote',
  );
});

test('both sides changed forks a conflict (never silently overwrites the user)', () => {
  assert.equal(
    decideCanvasMerge({ hasLocal: true, remoteChanged: true, localChanged: true, hashesEqual: false }),
    'fork-conflict',
  );
});

// --- canvasHash ------------------------------------------------------------

test('canvasHash is stable and sensitive to title and pages', async () => {
  const a = await canvasHash('Letter', ['one', 'two']);
  const again = await canvasHash('Letter', ['one', 'two']);
  assert.equal(a, again, 'deterministic');
  assert.notEqual(a, await canvasHash('Letter', ['one', 'three']), 'page change moves the hash');
  assert.notEqual(a, await canvasHash('Other', ['one', 'two']), 'title change moves the hash');
});

test('canvasHash distinguishes page boundaries (a join would collide these)', async () => {
  const x = await canvasHash('t', ['ab', 'c']);
  const y = await canvasHash('t', ['a', 'bc']);
  assert.notEqual(x, y, 'a structural page change must move the hash');
});

// --- bookkeeping store (with a localStorage shim) --------------------------

function installLocalStorage() {
  const m = new Map<string, string>();
  (globalThis as { localStorage?: Storage }).localStorage = {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    length: 0,
  } as Storage;
}

test.afterEach(() => { delete (globalThis as { localStorage?: Storage }).localStorage; });

test('cursor round-trips per user and defaults to 0', () => {
  installLocalStorage();
  assert.equal(getCanvasCursor('user-1'), 0);
  setCanvasCursor('user-1', 1234);
  assert.equal(getCanvasCursor('user-1'), 1234);
  assert.equal(getCanvasCursor('user-2'), 0, 'isolated per user');
});

test('doc sync entries round-trip and clear', () => {
  installLocalStorage();
  assert.equal(getDocSync('doc-1'), null);
  setDocSync('doc-1', { remoteUpdatedAt: 10, syncedHash: 'abc' });
  assert.deepEqual(getDocSync('doc-1'), { remoteUpdatedAt: 10, syncedHash: 'abc' });
  clearDocSync('doc-1');
  assert.equal(getDocSync('doc-1'), null);
});
