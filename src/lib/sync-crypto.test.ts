import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSyncProjectSnapshot,
  decryptJsonWithPassword,
  encryptJsonWithPassword,
  getSyncSpaceId,
  hashEncryptedPayload,
  type SyncProjectSnapshot,
} from './sync-crypto.ts';

test('password encryption round-trips a sync project snapshot', async () => {
  const snapshot = buildSyncProjectSnapshot({
    projectId: 'note-1',
    title: 'private note',
    pages: ['one', 'two'],
    scratchpad: 'side thought',
    updatedAt: 123,
  });

  const encrypted = await encryptJsonWithPassword(snapshot, 'correct horse', { iterations: 1_000 });
  assert.notEqual(encrypted.ciphertext.includes('private note'), true);

  const decrypted = await decryptJsonWithPassword<SyncProjectSnapshot>(encrypted, 'correct horse');
  assert.deepEqual(decrypted, snapshot);
});

test('password encryption uses fresh salt and iv each time', async () => {
  const value = { text: 'same note' };
  const first = await encryptJsonWithPassword(value, 'pw', { iterations: 1_000 });
  const second = await encryptJsonWithPassword(value, 'pw', { iterations: 1_000 });

  assert.notEqual(first.ciphertext, second.ciphertext);
  assert.notEqual(first.kdf.salt, second.kdf.salt);
  assert.notEqual(first.cipher.iv, second.cipher.iv);
});

test('wrong password cannot decrypt payload', async () => {
  const encrypted = await encryptJsonWithPassword({
    projectId: 'note-1',
    title: 'private note',
    pages: ['one'],
  }, 'right password', { iterations: 1_000 });

  await assert.rejects(
    () => decryptJsonWithPassword<SyncProjectSnapshot>(encrypted, 'wrong password'),
    /operation failed|decrypt/i,
  );
});

test('sync space id is deterministic and does not expose password', async () => {
  const first = await getSyncSpaceId('shared password');
  const second = await getSyncSpaceId('shared password');
  const different = await getSyncSpaceId('other password');

  assert.equal(first, second);
  assert.notEqual(first, different);
  assert.equal(first.includes('shared'), false);
});

test('encrypted payload hash changes with payload contents', async () => {
  const first = await encryptJsonWithPassword({ text: 'one' }, 'pw', { iterations: 1_000 });
  const second = await encryptJsonWithPassword({ text: 'two' }, 'pw', { iterations: 1_000 });

  assert.notEqual(await hashEncryptedPayload(first), await hashEncryptedPayload(second));
});
