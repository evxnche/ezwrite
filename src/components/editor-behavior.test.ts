import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { INDENT, LIST_EXIT } from './writing-helpers.ts';
import {
  getFloatingSlashButtonCursor,
  getPageEndCursor,
  getShareCardLines,
  getShareCardPalette,
  normalizePastedPlainText,
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

test('normalizePastedPlainText preserves line breaks from plain-text paste', () => {
  assert.equal(
    normalizePastedPlainText('first line\nsecond line\n\nthird line'),
    'first line\nsecond line\n\nthird line',
  );
});

test('getShareCardLines formats the current page for a clean read-only card', () => {
  assert.deepEqual(
    getShareCardLines('# Title\n\nlist\nfirst task\nline\ntimer 10m\nimg::data\nnormal line'),
    ['Title', '', 'first task', '', 'normal line'],
  );
});

test('getShareCardPalette follows the selected color theme', () => {
  assert.deepEqual(
    getShareCardPalette('red', false),
    { background: '#FFF4EE', paper: '#FFF4EE', text: '#351716', muted: 'rgba(53, 23, 22, 0.52)' },
  );
  assert.deepEqual(
    getShareCardPalette('red', true),
    { background: '#7C3232', paper: '#7C3232', text: '#FFF1EC', muted: 'rgba(255, 241, 236, 0.56)' },
  );
  assert.equal(getShareCardPalette('green', true).paper, getShareCardPalette('green', true).background);
});

test('WritingInterface exposes a current-page PNG share card export', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/components/WritingInterface.tsx'), 'utf8');
  assert.equal(source.includes('Share as PNG'), true);
  assert.equal(source.includes('aria-label="Share current page as PNG"'), true);
  assert.equal(source.includes('download-arrow-icon'), true);
  assert.equal(source.includes('download-share-icon'), false);
  assert.equal(source.includes('Share2'), false);
  assert.match(source, /aria-label="Download current page"[\s\S]*download-arrow-icon[\s\S]*aria-label="Share current page as PNG"[\s\S]*download-arrow-icon/);
  assert.equal(source.includes('saveAsShareCard'), true);
  assert.equal(source.includes('canvas.toBlob'), true);
});

test('WritingInterface uses ezwrite branding in the header and share card', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/components/WritingInterface.tsx'), 'utf8');
  assert.equal(source.includes("ctx.fillText('ezwrite.', width - 150, height - 210);"), true);
  assert.match(source, /className="font-playfair text-base sm:text-lg text-foreground tracking-tight"/);
  assert.match(source, />\s*ezwrite\.\s*<\/span>/);
  assert.match(source, /className="flex-1 pl-16 pr-4 sm:pl-24 sm:pr-14 bg-background flex flex-col cursor-text"/);
});

test('WritingInterface keeps dark and light mode inside settings', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/components/WritingInterface.tsx'), 'utf8');
  assert.equal(source.includes('Sun, Moon,'), false);
  assert.equal(source.includes('onClick={() => setTheme(theme ==='), false);
  assert.equal(source.includes('onToggleMode'), true);
});

test('WritingInterface does not attach dragstart to the contentEditable surface', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/components/WritingInterface.tsx'), 'utf8');
  assert.equal(source.includes('onDragStart={handleEditorDragStart}'), false);
});

test('WritingInterface seeds default copy only on page 1', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/components/WritingInterface.tsx'), 'utf8');
  assert.equal(source.includes("Array(TOTAL_PAGES - 1).fill(DEFAULT_PAGE_CONTENT)"), false);
});

test('WritingInterface container taps focus without scrolling the page to the top', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/components/WritingInterface.tsx'), 'utf8');
  assert.match(
    source,
    /const handleContainerClick = \(e: React\.MouseEvent\) => \{[\s\S]*?editorRef\.current\?\.focus\(\{ preventScroll: true \}\);[\s\S]*?scrollToLine\(lastLine\);/,
  );
});

test('App mounts UpdateBanner outside deferred idle UI gating', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf8');
  const deferredCount = (source.match(/showDeferredUi && \(/g) || []).length;
  assert.equal(deferredCount, 1);
});

test('UpdateBanner refreshes through the service-worker update helper', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/components/UpdateBanner.tsx'), 'utf8');
  assert.equal(source.includes('updateServiceWorker(true)'), true);
  assert.equal(source.includes('window.location.reload()'), false);
});

test('shouldAutoFocusAfterPageSwitch keeps autofocus on desktop only', () => {
  assert.equal(shouldAutoFocusAfterPageSwitch(false), true);
  assert.equal(shouldAutoFocusAfterPageSwitch(true), false);
});
