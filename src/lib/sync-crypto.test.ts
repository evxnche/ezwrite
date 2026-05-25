import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSyncProjectSnapshot,
  decryptSnapshotWithKey,
  deriveAuthSecret,
  deriveMasterKey,
  encryptSnapshotWithKey,
  hashSnapshot,
  type SyncProjectSnapshot,
} from './sync-crypto.ts';

test('v2 round-trips a sync project snapshot via the master key', async () => {
  const snapshot = buildSyncProjectSnapshot({
    projectId: 'note-1',
    title: 'private note',
    pages: ['one', 'two'],
    scratchpad: 'side',
    updatedAt: 123,
  });

  const masterKey = await deriveMasterKey('correct horse', 'alice');
  const encrypted = await encryptSnapshotWithKey(snapshot, masterKey);

  assert.equal(encrypted.version, 2);
  assert.equal(encrypted.ciphertext.includes('private note'), false);

  const decrypted = await decryptSnapshotWithKey<SyncProjectSnapshot>(encrypted, masterKey);
  assert.deepEqual(decrypted, snapshot);
});

test('auth secret is deterministic and username-scoped', async () => {
  // Same passphrase, normalized username -> identical auth secret (so device B logs in).
  assert.equal(await deriveAuthSecret('pw', 'alice'), await deriveAuthSecret('pw', 'ALICE '));
  assert.notEqual(await deriveAuthSecret('pw', 'alice'), await deriveAuthSecret('pw', 'bob'));
  assert.notEqual(await deriveAuthSecret('pw', 'alice'), await deriveAuthSecret('pw2', 'alice'));
});

test('the server-visible auth secret cannot decrypt note payloads', async () => {
  // The auth secret is the only password-derived value sent to the server. Prove that
  // it cannot be used to reconstruct the encryption key.
  const masterKey = await deriveMasterKey('pw', 'alice');
  const snapshot = buildSyncProjectSnapshot({ projectId: 'n', title: 'secret', pages: ['x'] });
  const encrypted = await encryptSnapshotWithKey(snapshot, masterKey);

  const authSecret = await deriveAuthSecret('pw', 'alice');
  const keyFromAuthSecret = await deriveMasterKey(authSecret, 'alice');
  await assert.rejects(() => decryptSnapshotWithKey(encrypted, keyFromAuthSecret));
});

test('each encryption uses a fresh salt and iv', async () => {
  const masterKey = await deriveMasterKey('pw', 'alice');
  const snapshot = buildSyncProjectSnapshot({ projectId: 'n', title: 't', pages: ['same'] });

  const first = await encryptSnapshotWithKey(snapshot, masterKey);
  const second = await encryptSnapshotWithKey(snapshot, masterKey);

  assert.notEqual(first.salt, second.salt);
  assert.notEqual(first.iv, second.iv);
  assert.notEqual(first.ciphertext, second.ciphertext);
});

test('a wrong password or username cannot decrypt', async () => {
  const snapshot = buildSyncProjectSnapshot({ projectId: 'n', title: 't', pages: ['x'] });
  const encrypted = await encryptSnapshotWithKey(snapshot, await deriveMasterKey('right', 'alice'));

  const wrongPassword = await deriveMasterKey('wrong', 'alice');
  const wrongUsername = await deriveMasterKey('right', 'bob');
  await assert.rejects(() => decryptSnapshotWithKey(encrypted, wrongPassword));
  await assert.rejects(() => decryptSnapshotWithKey(encrypted, wrongUsername));
});

test('snapshot hash is stable and content-sensitive', async () => {
  const a = buildSyncProjectSnapshot({ projectId: 'n', title: 't', pages: ['one'], updatedAt: 1 });
  const aAgain = buildSyncProjectSnapshot({ projectId: 'n', title: 't', pages: ['one'], updatedAt: 1 });
  const b = buildSyncProjectSnapshot({ projectId: 'n', title: 't', pages: ['two'], updatedAt: 1 });

  assert.equal(await hashSnapshot(a), await hashSnapshot(aAgain));
  assert.notEqual(await hashSnapshot(a), await hashSnapshot(b));
});
