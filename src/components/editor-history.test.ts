import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorHistory } from './editor-history.ts';

test('EditorHistory coalesces rapid pushes within debounce window', () => {
  const history = new EditorHistory({ debounceMs: 500 });
  history.push({ content: 'a' }, { force: true });
  history.push({ content: 'b' });
  history.push({ content: 'c' });
  assert.equal(history.canUndo, true);
  assert.equal(history.undo({ content: 'current' })?.content, 'a');
});

test('EditorHistory force push bypasses debounce', () => {
  const history = new EditorHistory({ debounceMs: 500 });
  history.push({ content: 'a' }, { force: true });
  history.push({ content: 'b' }, { force: true });
  assert.equal(history.undo({ content: 'x' })?.content, 'b');
});

test('EditorHistory caps undo stack depth', () => {
  const history = new EditorHistory({ debounceMs: 0, maxDepth: 3 });
  history.push({ content: '1' }, { force: true });
  history.push({ content: '2' }, { force: true });
  history.push({ content: '3' }, { force: true });
  history.push({ content: '4' }, { force: true });
  assert.equal(history.undo({ content: '5' })?.content, '4');
  assert.equal(history.undo({ content: '5' })?.content, '3');
  assert.equal(history.undo({ content: '5' })?.content, '2');
  assert.equal(history.undo({ content: '5' }), null);
});

test('EditorHistory undo/redo ordering', () => {
  const history = new EditorHistory({ debounceMs: 0 });
  history.push({ content: 'v1', cursor: { lineIndex: 0, offset: 0 } }, { force: true });
  history.push({ content: 'v2', cursor: { lineIndex: 0, offset: 1 } }, { force: true });

  const undone = history.undo({ content: 'v3', cursor: { lineIndex: 0, offset: 2 } });
  assert.deepEqual(undone, { content: 'v2', cursor: { lineIndex: 0, offset: 1 } });
  assert.equal(history.canRedo, true);

  const redone = history.redo({ content: 'v2', cursor: { lineIndex: 0, offset: 1 } });
  assert.deepEqual(redone, { content: 'v3', cursor: { lineIndex: 0, offset: 2 } });
});

test('EditorHistory clear resets stacks', () => {
  const history = new EditorHistory({ debounceMs: 0 });
  history.push({ content: 'a' }, { force: true });
  history.clear();
  assert.equal(history.canUndo, false);
  assert.equal(history.canRedo, false);
});

test('EditorHistory skips duplicate consecutive snapshots', () => {
  const history = new EditorHistory({ debounceMs: 0 });
  history.push({ content: 'same', cursor: { lineIndex: 1, offset: 2 } }, { force: true });
  history.push({ content: 'same', cursor: { lineIndex: 1, offset: 2 } }, { force: true });
  assert.equal(history.canUndo, true);
  assert.equal(history.undo({ content: 'other' })?.content, 'same');
  assert.equal(history.undo({ content: 'other' }), null);
});
