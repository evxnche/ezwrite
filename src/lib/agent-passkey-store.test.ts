import test from 'node:test';
import assert from 'node:assert/strict';

import {
  saveAgentPasskey,
  getAgentPasskey,
  getAgentPasskeyIds,
  removeAgentPasskey,
  type StorageLike,
} from './agent-passkey-store.ts';

class MemoryStorage implements StorageLike {
  #data = new Map<string, string>();
  getItem(key: string): string | null { return this.#data.get(key) ?? null; }
  setItem(key: string, value: string): void { this.#data.set(key, value); }
  removeItem(key: string): void { this.#data.delete(key); }
}

test('save then get returns the passkey for that pairing', () => {
  const s = new MemoryStorage();
  saveAgentPasskey(s, 'pair-1', 'brave-otter-42');
  assert.equal(getAgentPasskey(s, 'pair-1'), 'brave-otter-42');
});

test('get returns null for an unknown pairing', () => {
  const s = new MemoryStorage();
  assert.equal(getAgentPasskey(s, 'nope'), null);
});

test('stores multiple pairings independently and lists their ids', () => {
  const s = new MemoryStorage();
  saveAgentPasskey(s, 'a', 'word-one-11');
  saveAgentPasskey(s, 'b', 'word-two-22');
  assert.equal(getAgentPasskey(s, 'a'), 'word-one-11');
  assert.equal(getAgentPasskey(s, 'b'), 'word-two-22');
  assert.deepEqual(getAgentPasskeyIds(s).sort(), ['a', 'b']);
});

test('remove deletes only the targeted passkey', () => {
  const s = new MemoryStorage();
  saveAgentPasskey(s, 'a', 'word-one-11');
  saveAgentPasskey(s, 'b', 'word-two-22');
  removeAgentPasskey(s, 'a');
  assert.equal(getAgentPasskey(s, 'a'), null);
  assert.equal(getAgentPasskey(s, 'b'), 'word-two-22');
  assert.deepEqual(getAgentPasskeyIds(s), ['b']);
});

test('removing the last passkey clears the storage key', () => {
  const s = new MemoryStorage();
  saveAgentPasskey(s, 'a', 'word-one-11');
  removeAgentPasskey(s, 'a');
  assert.deepEqual(getAgentPasskeyIds(s), []);
  assert.equal(s.getItem('ezwrite-agent-passkeys'), null);
});

test('corrupt storage value degrades to empty rather than throwing', () => {
  const s = new MemoryStorage();
  s.setItem('ezwrite-agent-passkeys', '{not valid json');
  assert.equal(getAgentPasskey(s, 'a'), null);
  assert.deepEqual(getAgentPasskeyIds(s), []);
});
