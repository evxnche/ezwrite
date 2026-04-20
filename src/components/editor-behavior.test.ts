import test from 'node:test';
import assert from 'node:assert/strict';

import { INDENT, LIST_EXIT } from './writing-helpers.ts';
import {
  getFloatingSlashButtonCursor,
  getPageEndCursor,
  normalizeEditorContent,
  shouldAutoFocusAfterPageSwitch,
  splitExitedListLine,
} from './editor-behavior.ts';

test('normalizeEditorContent removes accidental leading regular spaces', () => {
  assert.equal(normalizeEditorContent(' hello'), 'hello');
});

test('normalizeEditorContent removes accidental leading non-breaking spaces', () => {
  assert.equal(normalizeEditorContent('\u00a0hello'), 'hello');
});

test('normalizeEditorContent preserves intentional indent blocks', () => {
  assert.equal(normalizeEditorContent(`${INDENT}hello`), `${INDENT}hello`);
});

test('normalizeEditorContent trims stray whitespace after a list exit marker', () => {
  assert.equal(normalizeEditorContent(`${LIST_EXIT}\u00a0hello`), `${LIST_EXIT}hello`);
});

test('splitExitedListLine keeps the final character on the current line when splitting at the end', () => {
  assert.deepEqual(
    splitExitedListLine(`${LIST_EXIT}hello`, 5),
    { current: `${LIST_EXIT}hello`, next: '' },
  );
});

test('splitExitedListLine splits the visible text without counting the hidden list-exit marker', () => {
  assert.deepEqual(
    splitExitedListLine(`${LIST_EXIT}hello`, 2),
    { current: `${LIST_EXIT}he`, next: 'llo' },
  );
});

test('getPageEndCursor places the cursor at the end of the final line', () => {
  assert.deepEqual(
    getPageEndCursor('first line\nsecond line'),
    { lineIndex: 1, offset: 11 },
  );
});

test('getFloatingSlashButtonCursor appends slash commands on a fresh bottom line', () => {
  assert.deepEqual(
    getFloatingSlashButtonCursor('first line\nsecond line'),
    {
      content: 'first line\nsecond line\n',
      lineIndex: 2,
      offset: 0,
    },
  );
});

test('getFloatingSlashButtonCursor reuses an existing trailing blank line', () => {
  assert.deepEqual(
    getFloatingSlashButtonCursor('first line\n'),
    {
      content: 'first line\n',
      lineIndex: 1,
      offset: 0,
    },
  );
});

test('shouldAutoFocusAfterPageSwitch keeps autofocus on desktop only', () => {
  assert.equal(shouldAutoFocusAfterPageSwitch(false), true);
  assert.equal(shouldAutoFocusAfterPageSwitch(true), false);
});
