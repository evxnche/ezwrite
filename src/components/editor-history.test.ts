import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorHistory, contentEntryToSnapshot, isContentHistoryEntry } from './editor-history.ts';

test('EditorHistory coalesces rapid pushes within debounce window', () => {
  const history = new EditorHistory({ debounceMs: 500 });
  history.push({ content: 'a' }, { force: true });
  history.push({ content: 'b' });
  history.push({ content: 'c' });
  assert.equal(history.canUndo, true);
  const undone = history.undo({ content: 'current' });
  assert.ok(undone && isContentHistoryEntry(undone));
  assert.equal(undone.content, 'a');
});

test('EditorHistory force push bypasses debounce', () => {
  const history = new EditorHistory({ debounceMs: 500 });
  history.push({ content: 'a' }, { force: true });
  history.push({ content: 'b' }, { force: true });
  const undone = history.undo({ content: 'x' });
  assert.ok(undone && isContentHistoryEntry(undone));
  assert.equal(undone.content, 'b');
});

test('EditorHistory caps undo stack depth', () => {
  const history = new EditorHistory({ debounceMs: 0, maxDepth: 3 });
  history.push({ content: '1' }, { force: true });
  history.push({ content: '2' }, { force: true });
  history.push({ content: '3' }, { force: true });
  history.push({ content: '4' }, { force: true });
  assert.equal(contentEntryToSnapshot(history.undo({ content: '5' }) as { type: 'content'; content: string }).content, '4');
  assert.equal(contentEntryToSnapshot(history.undo({ content: '5' }) as { type: 'content'; content: string }).content, '3');
  assert.equal(contentEntryToSnapshot(history.undo({ content: '5' }) as { type: 'content'; content: string }).content, '2');
  assert.equal(history.undo({ content: '5' }), null);
});

test('EditorHistory undo/redo ordering for content', () => {
  const history = new EditorHistory({ debounceMs: 0 });
  history.push({ content: 'v1', cursor: { lineIndex: 0, offset: 0 } }, { force: true });
  history.push({ content: 'v2', cursor: { lineIndex: 0, offset: 1 } }, { force: true });

  const undone = history.undo({ content: 'v3', cursor: { lineIndex: 0, offset: 2 } });
  assert.ok(undone && isContentHistoryEntry(undone));
  assert.deepEqual(contentEntryToSnapshot(undone), { content: 'v2', cursor: { lineIndex: 0, offset: 1 } });
  assert.equal(history.canRedo, true);

  const redone = history.redo({ content: 'v2', cursor: { lineIndex: 0, offset: 1 } });
  assert.ok(redone && isContentHistoryEntry(redone));
  assert.deepEqual(contentEntryToSnapshot(redone), { content: 'v3', cursor: { lineIndex: 0, offset: 2 } });
});

test('EditorHistory clear resets stacks', () => {
  const history = new EditorHistory({ debounceMs: 0 });
  history.push({ content: 'a' }, { force: true });
  history.clear();
  assert.equal(history.canUndo, false);
  assert.equal(history.canRedo, false);
});

test('EditorHistory skips duplicate consecutive content snapshots', () => {
  const history = new EditorHistory({ debounceMs: 0 });
  history.push({ content: 'same', cursor: { lineIndex: 1, offset: 2 } }, { force: true });
  history.push({ content: 'same', cursor: { lineIndex: 1, offset: 2 } }, { force: true });
  assert.equal(history.canUndo, true);
  const undone = history.undo({ content: 'other' });
  assert.ok(undone && isContentHistoryEntry(undone));
  assert.equal(undone.content, 'same');
  assert.equal(history.undo({ content: 'other' }), null);
});

test('EditorHistory interleaves page delete with content undo', () => {
  const history = new EditorHistory({ debounceMs: 0 });
  history.push({ content: 'draft' }, { force: true, pageIndex: 0 });
  history.pushPageDelete({ index: 1, content: 'removed page' });

  const firstUndo = history.undo({ content: 'after delete', pageIndex: 0, pages: ['draft'] });
  assert.equal(firstUndo?.type, 'page-delete');
  assert.deepEqual(firstUndo, { type: 'page-delete', deleted: { index: 1, content: 'removed page' } });

  history.onPageRestored(1);
  const secondUndo = history.undo({ content: 'after delete', pageIndex: 0, pages: ['draft', 'removed page'] });
  assert.ok(secondUndo && isContentHistoryEntry(secondUndo));
  assert.equal(secondUndo.pageIndex, 0);
  assert.equal(secondUndo.content, 'draft');
});

test('EditorHistory preserves earlier-page text undo after navigating away and deleting another page', () => {
  const history = new EditorHistory({ debounceMs: 0 });
  history.push({ content: 'before backspace' }, { force: true, pageIndex: 0 });
  history.pushPageDelete({ index: 1, content: 'page two' });

  const restorePage = history.undo({ content: 'live two', pageIndex: 1, pages: ['before backspace'] });
  assert.equal(restorePage?.type, 'page-delete');
  history.onPageRestored(1);

  const restoreText = history.undo({
    content: 'before backspace',
    pageIndex: 1,
    pages: ['before backspace', 'page two'],
  });
  assert.ok(restoreText && isContentHistoryEntry(restoreText));
  assert.equal(restoreText.pageIndex, 0);
  assert.equal(restoreText.content, 'before backspace');
});

test('EditorHistory redo restores a page delete after undo', () => {
  const history = new EditorHistory({ debounceMs: 0 });
  history.pushPageDelete({ index: 0, content: 'gone' });

  const undone = history.undo({ content: 'live', pageIndex: 0, pages: [] });
  assert.equal(undone?.type, 'page-delete');

  const redone = history.redo({ content: 'live', pageIndex: 0, pages: ['gone'] });
  assert.equal(redone?.type, 'page-delete-redo');
  assert.deepEqual(redone, { type: 'page-delete-redo', deleted: { index: 0, content: 'gone' } });
  assert.equal(history.canUndo, true);
});
