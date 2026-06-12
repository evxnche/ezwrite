import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getEnabledLiveSessionAgentIds,
  getEnabledLiveSessionAgents,
  isLiveSessionEnabledForAnyAgent,
  setLiveSessionAgentEnabled,
  type StorageLike,
} from './agent-live-session-store.ts';

class MemoryStorage implements StorageLike {
  #data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.#data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.#data.set(key, value);
  }

  removeItem(key: string): void {
    this.#data.delete(key);
  }
}

const pairings = [
  { id: 'claude', label: 'Claude' },
  { id: 'codex', label: 'Codex' },
  { id: 'gemini', label: 'Gemini' },
];

test('live-session agent toggles persist enabled pairing ids', () => {
  const storage = new MemoryStorage();

  setLiveSessionAgentEnabled(storage, 'claude', true);
  setLiveSessionAgentEnabled(storage, 'codex', true);

  assert.deepEqual(getEnabledLiveSessionAgentIds(storage), ['claude', 'codex']);
});

test('disabling a live-session agent removes it from the enabled id list', () => {
  const storage = new MemoryStorage();

  setLiveSessionAgentEnabled(storage, 'claude', true);
  setLiveSessionAgentEnabled(storage, 'claude', false);

  assert.deepEqual(getEnabledLiveSessionAgentIds(storage), []);
});

test('getEnabledLiveSessionAgents filters pairings to the currently toggled-on ids only', () => {
  const storage = new MemoryStorage();
  setLiveSessionAgentEnabled(storage, 'claude', true);
  setLiveSessionAgentEnabled(storage, 'gemini', true);

  assert.deepEqual(
    getEnabledLiveSessionAgents(
      pairings.map((pairing) => ({ ...pairing, revoked: false, targetProjectId: null, canManageProjects: true, createdAt: '', expiresAt: null, lastUsedAt: null })),
      storage,
    ).map((pairing) => pairing.label),
    ['Claude', 'Gemini'],
  );
});

test('isLiveSessionEnabledForAnyAgent returns false when no pairing is toggled on', () => {
  const storage = new MemoryStorage();
  assert.equal(isLiveSessionEnabledForAnyAgent(storage), false);
  setLiveSessionAgentEnabled(storage, 'codex', true);
  assert.equal(isLiveSessionEnabledForAnyAgent(storage), true);
});
