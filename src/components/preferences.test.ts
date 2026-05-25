import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_COLOR_THEME,
  getNextColorTheme,
  getNextTimerAlertMode,
  pickColorTheme,
  pickTimerAlertMode,
  resolveColorTheme,
} from './preferences.ts';
import { buildTimerSlots } from './timer-identity.ts';

test('pickColorTheme returns the exact theme that was clicked', () => {
  assert.equal(pickColorTheme('green'), 'green');
  assert.equal(pickColorTheme('red'), 'red');
  assert.equal(pickColorTheme(''), '');
});

test('resolveColorTheme defaults to red on first visit', () => {
  assert.equal(DEFAULT_COLOR_THEME, 'red');
  assert.equal(resolveColorTheme(null), 'red');
  assert.equal(resolveColorTheme(''), '');
  assert.equal(resolveColorTheme('blue'), 'blue');
});

test('pickTimerAlertMode returns the exact alert mode that was clicked', () => {
  assert.equal(pickTimerAlertMode('silent'), 'silent');
  assert.equal(pickTimerAlertMode('audio'), 'audio');
  assert.equal(pickTimerAlertMode('both'), 'both');
});

test('cycling helpers still preserve the existing toolbar cycle behavior', () => {
  assert.equal(getNextColorTheme(''), 'blue');
  assert.equal(getNextColorTheme('blue'), 'green');
  assert.equal(getNextTimerAlertMode('both'), 'visual');
  assert.equal(getNextTimerAlertMode('silent'), 'both');
});

test('buildTimerSlots gives duplicate timers distinct stable ids', () => {
  const slots = buildTimerSlots(['timer 5', 'timer 5', 'timer', 'timer']);

  assert.equal(slots.length, 4);
  assert.notEqual(slots[0].stableId, slots[1].stableId);
  assert.notEqual(slots[2].stableId, slots[3].stableId);
  assert.deepEqual(
    slots.map((slot) => slot.lineIndex),
    [0, 1, 2, 3],
  );
});
