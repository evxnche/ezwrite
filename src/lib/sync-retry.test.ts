import test from 'node:test';
import assert from 'node:assert/strict';

import { runSequentialSyncBatch, toSyncError } from './sync-retry.ts';

test('runSequentialSyncBatch keeps syncing later projects after an earlier failure', async () => {
  const attempted: string[] = [];
  const result = await runSequentialSyncBatch(['alpha', 'beta', 'gamma'], async (projectId) => {
    attempted.push(projectId);
    if (projectId === 'beta') throw new Error('offline');
  });

  assert.deepEqual(attempted, ['alpha', 'beta', 'gamma']);
  assert.deepEqual(
    result.failed.map((failure) => failure.projectId),
    ['beta'],
  );
  assert.equal(result.failed[0]?.error.message, 'offline');
});

test('toSyncError preserves Error instances and normalizes unknown failures', () => {
  const original = new Error('boom');

  assert.equal(toSyncError(original), original);
  assert.equal(toSyncError('bad network').message, 'bad network');
  assert.equal(toSyncError(undefined, 'Sync failed').message, 'Sync failed');
});
