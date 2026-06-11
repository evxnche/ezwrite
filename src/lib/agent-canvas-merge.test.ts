import test from 'node:test';
import assert from 'node:assert/strict';

import {
  decideCanvasMerge,
  canvasHash,
  getSyncedHash,
  setSyncedHash,
  clearSyncedHash,
  type CanvasMergeInput,
} from './agent-canvas-merge.ts';

// Base input; each test overrides the fields it cares about.
const base: CanvasMergeInput = {
  hasLocal: false,
  hasRemote: false,
  hadSynced: false,
  localChanged: false,
  remoteChanged: false,
  hashesEqual: false,
};

// --- decideCanvasMerge: the data-safety-critical policy --------------------

test('a brand-new agent doc (canvas-only, never synced) is pulled down', () => {
  assert.equal(
    decideCanvasMerge({ ...base, hasRemote: true, hadSynced: false }),
    'apply-remote',
  );
});

test('a local-only doc is seeded up to the canvas', () => {
  assert.equal(
    decideCanvasMerge({ ...base, hasLocal: true, localChanged: true }),
    'push-local',
  );
});

test('a synced doc the owner deleted locally is removed from the canvas', () => {
  // canvas-only, we knew it before, agent did not edit it since
  assert.equal(
    decideCanvasMerge({ ...base, hasRemote: true, hadSynced: true, remoteChanged: false }),
    'delete-remote',
  );
});

test('a deleted-locally doc that the agent edited since is resurrected, not deleted', () => {
  assert.equal(
    decideCanvasMerge({ ...base, hasRemote: true, hadSynced: true, remoteChanged: true }),
    'apply-remote',
  );
});

test('identical content on both sides just records the synced hash', () => {
  assert.equal(
    decideCanvasMerge({ ...base, hasLocal: true, hasRemote: true, hadSynced: false, hashesEqual: true, remoteChanged: true }),
    'mark-synced',
  );
});

test('agent edited, owner did not -> apply remote', () => {
  assert.equal(
    decideCanvasMerge({ ...base, hasLocal: true, hasRemote: true, hadSynced: true, remoteChanged: true, localChanged: false, hashesEqual: false }),
    'apply-remote',
  );
});

test('owner edited, agent did not -> push local', () => {
  assert.equal(
    decideCanvasMerge({ ...base, hasLocal: true, hasRemote: true, hadSynced: true, remoteChanged: false, localChanged: true, hashesEqual: false }),
    'push-local',
  );
});

test('both edited -> fork a conflict (never silently overwrite the owner)', () => {
  assert.equal(
    decideCanvasMerge({ ...base, hasLocal: true, hasRemote: true, hadSynced: true, remoteChanged: true, localChanged: true, hashesEqual: false }),
    'fork-conflict',
  );
});

// --- canvasHash ------------------------------------------------------------

test('canvasHash is stable and sensitive to title and pages', async () => {
  const a = await canvasHash('Letter', ['one', 'two']);
  assert.equal(a, await canvasHash('Letter', ['one', 'two']));
  assert.notEqual(a, await canvasHash('Letter', ['one', 'three']));
  assert.notEqual(a, await canvasHash('Other', ['one', 'two']));
});

test('canvasHash distinguishes page boundaries (a join would collide these)', async () => {
  assert.notEqual(await canvasHash('t', ['ab', 'c']), await canvasHash('t', ['a', 'bc']));
});

// --- bookkeeping store -----------------------------------------------------

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

test('synced-hash entries round-trip and clear', () => {
  installLocalStorage();
  assert.equal(getSyncedHash('doc-1'), null);
  setSyncedHash('doc-1', 'abc123');
  assert.equal(getSyncedHash('doc-1'), 'abc123');
  clearSyncedHash('doc-1');
  assert.equal(getSyncedHash('doc-1'), null);
});
