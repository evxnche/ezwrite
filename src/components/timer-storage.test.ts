import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadTimerState,
  saveTimerState,
  clearTimerState,
  restoreDisplaySeconds,
  type SavedTimer,
} from './timer-storage';

// Minimal in-memory localStorage stub so the storage helpers run under node:test.
function installLocalStorage() {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: Storage }).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

const base: SavedTimer = { baseSeconds: 1500, epoch: 1_000_000, running: true, phase: 'work', done: false };

test('saveTimerState / loadTimerState round-trips state', () => {
  installLocalStorage();
  saveTimerState('main:n1:0:25 5::1', base);
  assert.deepEqual(loadTimerState('main:n1:0:25 5::1'), base);
});

test('loadTimerState returns null for missing or undefined key', () => {
  installLocalStorage();
  assert.equal(loadTimerState('nope'), null);
  assert.equal(loadTimerState(undefined), null);
});

test('clearTimerState removes persisted state', () => {
  installLocalStorage();
  saveTimerState('k', base);
  clearTimerState('k');
  assert.equal(loadTimerState('k'), null);
});

test('restoreDisplaySeconds: running countdown subtracts time spent unmounted', () => {
  // anchored at epoch 0, 1500s base, 200s later → 1300s remain
  const s: SavedTimer = { ...base, epoch: 0, baseSeconds: 1500, running: true };
  assert.equal(restoreDisplaySeconds(s, 'countdown', 200_000), 1300);
});

test('restoreDisplaySeconds: paused countdown ignores elapsed wall-clock', () => {
  const s: SavedTimer = { ...base, epoch: 0, baseSeconds: 1500, running: false };
  assert.equal(restoreDisplaySeconds(s, 'countdown', 999_000), 1500);
});

test('restoreDisplaySeconds: countdown clamps at zero, never negative', () => {
  const s: SavedTimer = { ...base, epoch: 0, baseSeconds: 60, running: true };
  assert.equal(restoreDisplaySeconds(s, 'countdown', 120_000), 0);
});

test('restoreDisplaySeconds: stopwatch accumulates elapsed onto base', () => {
  const s: SavedTimer = { ...base, epoch: 0, baseSeconds: 30, running: true };
  assert.equal(restoreDisplaySeconds(s, 'stopwatch', 45_000), 75);
});

test('restoreDisplaySeconds: done countdown shows 0, done stopwatch keeps base', () => {
  assert.equal(restoreDisplaySeconds({ ...base, done: true }, 'countdown', 0), 0);
  assert.equal(restoreDisplaySeconds({ ...base, done: true, baseSeconds: 90 }, 'stopwatch', 0), 90);
});
