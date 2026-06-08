import test from 'node:test';
import assert from 'node:assert/strict';

import { selectOrphanSnapshotIds } from './agent-relay-logic.ts';

const NOW = Date.parse('2026-06-08T12:00:00.000Z');
const STALE_MS = 10 * 60 * 1000;
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

test('selectOrphanSnapshotIds reaps stale rows whose doc is gone locally', () => {
  const orphans = selectOrphanSnapshotIds(
    ['keep-me'],
    [
      { project_id: 'keep-me', updated_at: iso(0) },
      { project_id: 'orphan-old', updated_at: iso(STALE_MS + 1000) },
    ],
    { now: NOW, staleMs: STALE_MS },
  );
  assert.deepEqual(orphans, ['orphan-old']);
});

test('selectOrphanSnapshotIds spares a recently-published row (another live device)', () => {
  const orphans = selectOrphanSnapshotIds(
    ['my-doc'],
    [{ project_id: 'other-device-doc', updated_at: iso(5_000) }], // 5s old, still fresh
    { now: NOW, staleMs: STALE_MS },
  );
  assert.deepEqual(orphans, []);
});

test('selectOrphanSnapshotIds never prunes a doc that still exists locally', () => {
  const orphans = selectOrphanSnapshotIds(
    ['a', 'b'],
    [{ project_id: 'a', updated_at: iso(STALE_MS * 5) }], // ancient but still local
    { now: NOW, staleMs: STALE_MS },
  );
  assert.deepEqual(orphans, []);
});

test('selectOrphanSnapshotIds returns nothing when local storage reads empty (safety guard)', () => {
  const orphans = selectOrphanSnapshotIds(
    [],
    [{ project_id: 'x', updated_at: iso(STALE_MS * 10) }],
    { now: NOW, staleMs: STALE_MS },
  );
  assert.deepEqual(orphans, []);
});
