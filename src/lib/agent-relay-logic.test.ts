import test from 'node:test';
import assert from 'node:assert/strict';

import {
  decideDrain,
  selectOrphanSnapshotIds,
  MAX_OP_ATTEMPTS,
  type OpOutcome,
} from './agent-relay-logic.ts';

// --- decideDrain -----------------------------------------------------------

test('decideDrain consumes ops that applied cleanly', () => {
  const attempts = new Map<number, number>();
  const { consumedIds, deadLettered } = decideDrain(
    [{ id: 1, ok: true }, { id: 2, ok: true }],
    attempts,
  );
  assert.deepEqual(consumedIds, [1, 2]);
  assert.deepEqual(deadLettered, []);
  assert.equal(attempts.size, 0);
});

test('decideDrain leaves a failed op un-consumed so it retries next tick', () => {
  const attempts = new Map<number, number>();
  const { consumedIds, deadLettered } = decideDrain(
    [{ id: 7, ok: false, error: 'boom' }],
    attempts,
  );
  // Not consumed yet — it gets another shot.
  assert.deepEqual(consumedIds, []);
  assert.deepEqual(deadLettered, []);
  assert.equal(attempts.get(7), 1);
});

test('decideDrain dead-letters a poison op after MAX_OP_ATTEMPTS instead of wedging the queue', () => {
  const attempts = new Map<number, number>();
  const outcomes: OpOutcome[] = [{ id: 9, ok: false, error: 'still bad' }];

  // Tick 1 and 2: retried, not consumed.
  for (let i = 1; i < MAX_OP_ATTEMPTS; i++) {
    const d = decideDrain(outcomes, attempts);
    assert.deepEqual(d.consumedIds, [], `attempt ${i} should not consume`);
    assert.equal(attempts.get(9), i);
  }
  // Final tick: consumed (dead-lettered) and surfaced.
  const final = decideDrain(outcomes, attempts);
  assert.deepEqual(final.consumedIds, [9]);
  assert.deepEqual(final.deadLettered, [{ id: 9, error: 'still bad' }]);
  assert.equal(attempts.has(9), false, 'attempt counter cleared after dead-letter');
});

test('decideDrain clears the retry counter once a previously-failing op succeeds', () => {
  const attempts = new Map<number, number>([[3, 1]]);
  const { consumedIds } = decideDrain([{ id: 3, ok: true }], attempts);
  assert.deepEqual(consumedIds, [3]);
  assert.equal(attempts.has(3), false);
});

// --- selectOrphanSnapshotIds ----------------------------------------------

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
