import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { INDENT, LIST_EXIT } from './writing-helpers.ts';
import {
  getFloatingSlashButtonCursor,
  getMobileFloatingSlashButtonTop,
  MOBILE_FLOATING_SLASH_BUTTON_SIZE_PX,
  getTouchGestureIntent,
  getPageEndCursor,
  prepareFloatingSlashButtonCommand,
  getShareCardLines,
  getShareCardPalette,
  normalizePastedPlainText,
  normalizeClipboardPasteText,
  normalizeEditorContent,
  deletePageFromList,
  indentPlainListLineForTab,
  renumberFollowingPlainNumberedListItems,
  restoreDeletedPageToList,
  shouldAutoFocusAfterPageSwitch,
  splitExitedListLine,
  getMarkdownRangeForSelection,
  getExactSlashCommand,
  getClosestLineIndexForClick,
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

test('renumberFollowingPlainNumberedListItems shifts slash-numbered items after an insert', () => {
  assert.deepEqual(
    renumberFollowingPlainNumberedListItems(
      ['1/ first', '2/ ', '2/ second', '3/ third', '4/ fourth', '5/ fifth'],
      1,
    ),
    ['1/ first', '2/ ', '3/ second', '4/ third', '5/ fourth', '6/ fifth'],
  );
});

test('renumberFollowingPlainNumberedListItems shifts dot-numbered items after an insert', () => {
  assert.deepEqual(
    renumberFollowingPlainNumberedListItems(
      ['1. first', '2. ', '2. second', '3. third'],
      1,
    ),
    ['1. first', '2. ', '3. second', '4. third'],
  );
});

test('renumberFollowingPlainNumberedListItems preserves an intentional non-one list start', () => {
  assert.deepEqual(
    renumberFollowingPlainNumberedListItems(
      ['4/ first', '5/ ', '5/ second'],
      1,
    ),
    ['4/ first', '5/ ', '6/ second'],
  );
});

test('renumberFollowingPlainNumberedListItems stops at a non-list line', () => {
  assert.deepEqual(
    renumberFollowingPlainNumberedListItems(
      ['1. first', '2. ', '2. second', '', '3. third'],
      1,
    ),
    ['1. first', '2. ', '3. second', '', '3. third'],
  );
});

test('renumberFollowingPlainNumberedListItems keeps nested lists from advancing parent numbering', () => {
  assert.deepEqual(
    renumberFollowingPlainNumberedListItems(
      ['1/ first', '2/ second', `${INDENT}1/ nested`, `${INDENT}2/ nested`, `${INDENT}3/ nested`, '4/ third', '5/ fourth'],
      4,
    ),
    ['1/ first', '2/ second', `${INDENT}1/ nested`, `${INDENT}2/ nested`, `${INDENT}3/ nested`, '3/ third', '4/ fourth'],
  );
});

test('renumberFollowingPlainNumberedListItems renumbers after exiting a nested numbered list', () => {
  assert.deepEqual(
    renumberFollowingPlainNumberedListItems(
      ['1/ first', '2/ second', `${INDENT}1/ nested`, `${INDENT}2/ nested`, `${INDENT}3/ nested`, '4/ ', '4/ third', '5/ fourth'],
      5,
    ),
    ['1/ first', '2/ second', `${INDENT}1/ nested`, `${INDENT}2/ nested`, `${INDENT}3/ nested`, '3/ ', '4/ third', '5/ fourth'],
  );
});

test('indentPlainListLineForTab resets dot-numbered sublists to one', () => {
  assert.deepEqual(
    indentPlainListLineForTab(['1. first', '2. '], 1, 3),
    {
      lines: ['1. first', `${INDENT}1. `],
      offset: `${INDENT}1. `.length,
    },
  );
});

test('indentPlainListLineForTab resets slash-numbered sublists to one', () => {
  assert.deepEqual(
    indentPlainListLineForTab(['1/ first', '2/ '], 1, 3),
    {
      lines: ['1/ first', `${INDENT}1/ `],
      offset: `${INDENT}1/ `.length,
    },
  );
});

test('indentPlainListLineForTab renumbers following parent list items after indenting a numbered item', () => {
  assert.deepEqual(
    indentPlainListLineForTab(['1. first', '2. ', '3. second', '4. third'], 1, 3),
    {
      lines: ['1. first', `${INDENT}1. `, '2. second', '3. third'],
      offset: `${INDENT}1. `.length,
    },
  );
});

test('indentPlainListLineForTab continues an existing nested numbered list', () => {
  assert.deepEqual(
    indentPlainListLineForTab(['1/ first', '2/ second', `${INDENT}1/ nested`, `${INDENT}2/ nested`, '3/ third', '4/ fourth'], 4, 3),
    {
      lines: ['1/ first', '2/ second', `${INDENT}1/ nested`, `${INDENT}2/ nested`, `${INDENT}3/ third`, '3/ fourth'],
      offset: `${INDENT}3/ `.length,
    },
  );
});

test('indentPlainListLineForTab keeps regular bullet indentation behavior', () => {
  assert.deepEqual(
    indentPlainListLineForTab(['- first'], 0, 2),
    {
      lines: [`${INDENT}- first`],
      offset: INDENT.length + 2,
    },
  );
});

test('deletePageFromList removes the current page and selects the next available page', () => {
  assert.deepEqual(
    deletePageFromList(['one', 'two', 'three'], 1, 1),
    {
      pages: ['one', 'three'],
      nextPage: 1,
      deleted: { index: 1, content: 'two' },
    },
  );
});

test('deletePageFromList refuses to delete the final page', () => {
  assert.equal(deletePageFromList(['only'], 0, 0), null);
});

test('restoreDeletedPageToList restores deleted pages at their original index', () => {
  assert.deepEqual(
    restoreDeletedPageToList(['one', 'three'], { index: 1, content: 'two' }),
    {
      pages: ['one', 'two', 'three'],
      restoredPage: 1,
    },
  );
});

test('deleted pages restore cleanly after repeated trigger-happy deletes', () => {
  const firstDelete = deletePageFromList(['one', 'two', 'three', 'four'], 3, 3);
  assert.ok(firstDelete);
  const secondDelete = deletePageFromList(firstDelete.pages, 2, firstDelete.nextPage);
  assert.ok(secondDelete);

  const firstRestore = restoreDeletedPageToList(secondDelete.pages, secondDelete.deleted);
  const secondRestore = restoreDeletedPageToList(firstRestore.pages, firstDelete.deleted);

  assert.deepEqual(firstRestore, {
    pages: ['one', 'two', 'three'],
    restoredPage: 2,
  });
  assert.deepEqual(secondRestore, {
    pages: ['one', 'two', 'three', 'four'],
    restoredPage: 3,
  });
});

test('getPageEndCursor places the cursor at the end of the final line', () => {
  assert.deepEqual(
    getPageEndCursor('first line\nsecond line'),
    { lineIndex: 1, offset: 11 },
  );
});

test('getMobileFloatingSlashButtonTop centers on the caret line when there is room', () => {
  assert.equal(
    getMobileFloatingSlashButtonTop({
      caretTop: 200,
      caretBottom: 228,
      caretHeight: 28,
      viewportHeight: 800,
      keyboardHeight: 0,
    }),
    200 + 28 / 2 - MOBILE_FLOATING_SLASH_BUTTON_SIZE_PX / 2,
  );
});

test('getMobileFloatingSlashButtonTop clamps above an open keyboard', () => {
  const top = getMobileFloatingSlashButtonTop({
    caretTop: 700,
    caretBottom: 728,
    caretHeight: 28,
    viewportHeight: 800,
    keyboardHeight: 320,
  });
  const maxTop = 800 - 320 - MOBILE_FLOATING_SLASH_BUTTON_SIZE_PX - 8;
  assert.equal(top, maxTop);
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

test('prepareFloatingSlashButtonCommand inserts a slash command line after regular text', () => {
  assert.deepEqual(
    prepareFloatingSlashButtonCommand('first line\nsecond line', 0),
    {
      content: 'first line\n/\nsecond line',
      lineIndex: 1,
      offset: 1,
      filter: '',
    },
  );
});

test('prepareFloatingSlashButtonCommand reuses an empty current line', () => {
  assert.deepEqual(
    prepareFloatingSlashButtonCommand('first line\n', 1),
    {
      content: 'first line\n/',
      lineIndex: 1,
      offset: 1,
      filter: '',
    },
  );
});

test('prepareFloatingSlashButtonCommand preserves an in-progress slash filter', () => {
  assert.deepEqual(
    prepareFloatingSlashButtonCommand('first line\n/li', 1),
    {
      content: 'first line\n/li',
      lineIndex: 1,
      offset: 3,
      filter: 'li',
    },
  );
});

test('getTouchGestureIntent prefers keyboard dismissal for a downward editor swipe', () => {
  assert.equal(
    getTouchGestureIntent({
      dx: 18,
      dy: 96,
      hasSelection: false,
      isKeyboardOpen: true,
      isEditorFocused: true,
    }),
    'dismiss-keyboard',
  );
});

test('getTouchGestureIntent keeps horizontal page swipes when the keyboard is closed', () => {
  assert.equal(
    getTouchGestureIntent({
      dx: -90,
      dy: 12,
      hasSelection: false,
      isKeyboardOpen: false,
      isEditorFocused: true,
    }),
    'page-next',
  );
});

test('getTouchGestureIntent ignores short horizontal drags', () => {
  assert.equal(
    getTouchGestureIntent({
      dx: -70,
      dy: 10,
      hasSelection: false,
      isKeyboardOpen: false,
      isEditorFocused: true,
    }),
    null,
  );
});

test('normalizePastedPlainText preserves line breaks from plain-text paste', () => {
  assert.equal(
    normalizePastedPlainText('first line\nsecond line\n\nthird line'),
    'first line\nsecond line\n\nthird line',
  );
});

test('normalizeClipboardPasteText prefers Markdown task plain text over rendered HTML', () => {
  const plain = '- [ ] open task\n- [x] done task';
  const html = '<ul><li>open task</li><li>done task</li></ul>';

  assert.equal(normalizeClipboardPasteText(plain, html), plain);
});

test('getShareCardLines formats the current page for a clean read-only card', () => {
  assert.deepEqual(
    getShareCardLines('# Title\n\nlist\nfirst task\nline\ntimer 10m\nnormal line'),
    ['Title', '', '[ ] first task', '', 'normal line'],
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
  const writingSource = fs.readFileSync(path.join(process.cwd(), 'src/components/WritingInterface.tsx'), 'utf8');
  const notesSource = fs.readFileSync(path.join(process.cwd(), 'src/components/NotesPanel.tsx'), 'utf8');
  const appSource = fs.readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf8');
  const cssSource = fs.readFileSync(path.join(process.cwd(), 'src/index.css'), 'utf8');
  assert.equal(notesSource.includes("'img'"), true);
  assert.equal(notesSource.includes('onExportPng'), true);
  assert.equal(notesSource.includes('page as md'), true);
  assert.equal(notesSource.includes('notebook as md'), true);
  assert.equal(notesSource.includes('page as pdf'), true);
  assert.equal(notesSource.includes('notebook as pdf'), true);
  assert.equal(writingSource.includes('saveAsShareCard'), true);
  assert.equal(writingSource.includes('saveDocAsMd'), true);
  assert.equal(writingSource.includes('canvas.toBlob'), true);
  assert.equal(notesSource.includes('<span>notebooks</span>'), true);
  assert.equal(notesSource.includes('<span>new notebook</span>'), true);
  assert.equal(writingSource.includes('aria-label="Pages in this doc"'), true);
  assert.equal(writingSource.includes('title={`page ${i + 1} of ${pageCount}`}'), true);
  assert.equal(writingSource.includes('e.preventDefault();'), true);
  assert.equal(appSource.includes('ezwriteStayHere'), true);
  assert.equal(appSource.includes("window.addEventListener('popstate', blockBackNavigation);"), true);
  assert.equal(cssSource.includes('overscroll-behavior-x: none;'), true);
});

test('NotesPanel keeps doc rename on double-click and opens a doc menu on right-click', () => {
  const notesSource = fs.readFileSync(path.join(process.cwd(), 'src/components/NotesPanel.tsx'), 'utf8');
  const projectsSource = fs.readFileSync(path.join(process.cwd(), 'src/lib/projects.ts'), 'utf8');
  assert.equal(notesSource.includes('onDoubleClick={handleRowDoubleClick}'), true);
  assert.equal(notesSource.includes('onContextMenuCapture={handleRowContextMenu}'), true);
  assert.equal(notesSource.includes('onMouseDownCapture={handleRowMouseDownCapture}'), true);
  assert.equal(notesSource.includes('fixed inset-0 z-[55]'), true);
  assert.equal(notesSource.includes('rename doc'), true);
  assert.equal(notesSource.includes('delete doc'), true);
  assert.match(notesSource, /const handleRowDoubleClick = \(e: React\.MouseEvent\) => \{[\s\S]*?e\.preventDefault\(\);[\s\S]*?e\.stopPropagation\(\);[\s\S]*?startRename\(project\.id, title\);/);
  assert.match(notesSource, /const handleRowContextMenu = \(e: React\.MouseEvent\) => \{[\s\S]*?e\.preventDefault\(\);[\s\S]*?e\.stopPropagation\(\);[\s\S]*?openDocMenu\(project\.id, title, e\.clientX, e\.clientY\);/);
  assert.match(notesSource, /const handleRowMouseDownCapture = \(e: React\.MouseEvent\) => \{[\s\S]*?if \(e\.button === 2\) \{[\s\S]*?e\.preventDefault\(\);[\s\S]*?e\.stopPropagation\(\);/);
  assert.match(notesSource, /useEffect\(\(\) => cancelPendingClick, \[\]\);/);
  assert.match(projectsSource, /export interface ProjectMeta \{[\s\S]*?title\?: string;/);
  assert.equal(projectsSource.includes('pages[0] = replaceTitleLine'), false);
});

test('WritingInterface uses ezwrite branding in the header and share card', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/components/WritingInterface.tsx'), 'utf8');
  assert.equal(source.includes("ctx.fillText('ezwrite.', width - 110, height - 130);"), true);
  assert.match(source, /fontFamily: "'Instrument Serif', serif"/);
  assert.match(source, />\s*ezwrite\.\s*<\/span>/);
  assert.match(source, /className="flex-1 px-4 sm:px-\[64px\] bg-background flex flex-col cursor-text"/);
  assert.equal(source.includes('const VISUAL_METRICS'), true);
});

test('WritingInterface imports the empty-page delete icon used after page creation', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/components/WritingInterface.tsx'), 'utf8');
  assert.match(source, /import \{[^}]*Trash2[^}]*\} from 'lucide-react';/);
  assert.equal(source.includes('<Trash2 size={16} />'), true);
});

test('WritingInterface applies requested dark text color', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/components/WritingInterface.tsx'), 'utf8');
  assert.equal(source.includes("darkTextColor: '#F0EEDE'"), true);
});

test('Scratchpad stays isolated and follows editor font choice', () => {
  const writingSource = fs.readFileSync(path.join(process.cwd(), 'src/components/WritingInterface.tsx'), 'utf8');
  const scratchpadSource = fs.readFileSync(path.join(process.cwd(), 'src/components/ScratchpadPanel.tsx'), 'utf8');
  assert.equal(writingSource.includes('useSerif={useSerif}'), true);
  assert.equal(writingSource.includes('title={pageToTitle(pagesRef.current[0] ?? \'\')}'), false);
  assert.equal(scratchpadSource.includes("useSerif ? 'font-playfair' : 'font-mono'"), true);
  assert.equal(scratchpadSource.includes('onKeyDown={(e) => e.stopPropagation()}'), true);
  assert.equal(scratchpadSource.includes('onPointerDown={(e) => e.stopPropagation()}'), true);
  assert.equal(scratchpadSource.includes('>{title}</div>'), false);
  assert.equal(scratchpadSource.includes('if (!open) return null;'), false);
  assert.equal(scratchpadSource.includes('aria-hidden={!open}'), true);
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

test('WritingInterface hydrates the saved current page instead of overwriting it on mount', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/components/WritingInterface.tsx'), 'utf8');
  assert.equal(source.includes('const currentPageRef = useRef(currentPage);'), true);
  assert.equal(source.includes('const contentRef = useRef(getPageContent(currentPage));'), true);
  assert.equal(source.includes('structuralUpdate(contentRef.current, 0, 0, true, false);'), true);
  assert.equal(source.includes('const currentPageRef = useRef(0);'), false);
  assert.equal(source.includes('const contentRef = useRef(getPageContent(0));'), false);
});

test('WritingInterface makes page deletion undoable from Cmd+Z and the notice action', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/components/WritingInterface.tsx'), 'utf8');
  assert.equal(source.includes('deletePageFromList'), true);
  assert.equal(source.includes('restoreDeletedPageToList'), true);
  assert.equal(source.includes('restoreLastDeletedPage()'), true);
  assert.equal(source.includes('const PAGE_DELETE_NOTICE_MS = 3000;'), true);
  assert.equal(source.includes('page deleted.'), true);
  assert.equal(source.includes('undo.'), true);
});

test('WritingInterface renders page switches without resaving target page content', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/components/WritingInterface.tsx'), 'utf8');
  assert.match(source, /const structuralUpdate = useCallback\(\([\s\S]*?persist = true,[\s\S]*?if \(persist\) saveContent\(content\);/);
  assert.equal(source.includes('currentPageRef.current = newPage;'), true);
  assert.equal(source.includes('structuralUpdateRef.current(pageContent, lineIndex, offset, shouldFocus, false);'), true);
  assert.equal(source.includes('structuralUpdate(contentRef.current, lineIndex, offset, !isTouchDevice, false);'), true);
});

test('WritingInterface flushes current editor content during browser lifecycle exits', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/components/WritingInterface.tsx'), 'utf8');
  assert.equal(source.includes('const flushCurrentProject = useCallback'), true);
  assert.equal(source.includes('const pagesSnapshot = [...pages];'), true);
  assert.equal(source.includes('const scratchpadSnapshot = scratchpadRef.current;'), true);
  assert.equal(source.includes("document.addEventListener('visibilitychange', flushWhenHidden);"), true);
  assert.equal(source.includes("window.addEventListener('pagehide', flushForLifecycle);"), true);
  assert.equal(source.includes("window.addEventListener('beforeunload', flushForLifecycle);"), true);
  assert.equal(source.includes('void writeToOPFS(latestPages, projectId, scratchpadValue, { delay: 0 });'), true);
});

test('project storage keeps a last-known-good backup for pages and scratchpad', () => {
  const projectsSource = fs.readFileSync(path.join(process.cwd(), 'src/lib/projects.ts'), 'utf8');
  assert.equal(projectsSource.includes('function projectPagesBackupKey'), true);
  assert.equal(projectsSource.includes('function projectScratchpadBackupKey'), true);
  assert.match(projectsSource, /return parsePages\(localStorage\.getItem\(projectPagesKey\(id\)\)\)[\s\S]*parsePages\(localStorage\.getItem\(projectPagesBackupKey\(id\)\)\)/);
  assert.equal(projectsSource.includes('localStorage.setItem(projectPagesBackupKey(id), JSON.stringify(safePages));'), true);
  assert.equal(projectsSource.includes('localStorage.setItem(projectScratchpadBackupKey(id), value);'), true);
});

test('OPFS backup writes coalesce to the latest pending Markdown payload', () => {
  const storageSource = fs.readFileSync(path.join(process.cwd(), 'src/lib/storage.ts'), 'utf8');
  assert.equal(storageSource.includes('let opfsPendingWrite'), true);
  assert.equal(storageSource.includes("import { contentToMarkdown } from '@/components/writing-helpers';"), true);
  assert.equal(storageSource.includes('const markdowns = pages.map((page) => contentToMarkdown(page));'), true);
  assert.equal(storageSource.includes('opfsPendingWrite = { pages: markdowns, projectId, scratchpad };'), true);
  assert.equal(storageSource.includes('if (opfsWriteScheduled) return;'), true);
  assert.equal(storageSource.includes('opfsLastProjectId'), false);
});

test('WritingInterface routes sync entry points through retry-safe helpers instead of direct fire-and-forget pushes', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/components/WritingInterface.tsx'), 'utf8');

  assert.match(source, /const runProjectSync = useCallback\(/);
  assert.equal(source.includes('pushProjectToSync(projectId).catch((error) => {'), false);
  assert.equal(source.includes("void pushProjectToSync(projectId, session, { keepalive: true }).catch(() => {});"), false);
  assert.equal(source.includes('if (needsPush) await pushProjectToSync(project.id, session);'), false);
  assert.match(source, /runProjectSync\(projectId, \{ keepalive: true \}\)/);
  assert.match(source, /runSequentialSyncBatch\(/);
});

test('WritingInterface container taps focus without scrolling the page to the top', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/components/WritingInterface.tsx'), 'utf8');
  assert.match(
    source,
    /const handleContainerClick = \(e: React\.MouseEvent\) => \{[\s\S]*?editorRef\.current\?\.focus\(\{ preventScroll: true \}\);[\s\S]*?getClosestLineIndexForClick\(e\.clientY, lineRects\);[\s\S]*?setCursorPosition\(editorRef\.current!, lineIndex, offset\);/,
  );
  assert.equal(source.includes('scrollToLine(lastLine);'), false);
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

test('getClosestLineIndexForClick picks the nearest line for a background click', () => {
  const rects = [
    { top: 100, bottom: 130 },
    { top: 160, bottom: 190 },
    { top: 220, bottom: 250 },
  ];

  assert.equal(getClosestLineIndexForClick(110, rects), 0);
  assert.equal(getClosestLineIndexForClick(150, rects), 1);
  assert.equal(getClosestLineIndexForClick(80, rects), 0);
  assert.equal(getClosestLineIndexForClick(280, rects), 2);
});

test('getExactSlashCommand recognizes complete slash commands only', () => {
  assert.equal(getExactSlashCommand('/line'), 'line');
  assert.equal(getExactSlashCommand('  /list  '), 'list');
  assert.equal(getExactSlashCommand(`${LIST_EXIT}/timer`), 'timer');
  assert.equal(getExactSlashCommand('/image'), 'image');
  assert.equal(getExactSlashCommand('/photo'), null);
  assert.equal(getExactSlashCommand('/li'), null);
  assert.equal(getExactSlashCommand('/line extra'), null);
  assert.equal(getExactSlashCommand('not /line'), null);
});

test('getMarkdownRangeForSelection excludes an untouched trailing line', () => {
  assert.deepEqual(
    getMarkdownRangeForSelection(
      { lineIndex: 1, offset: 0 },
      { lineIndex: 2, offset: 0 },
      ['list', 'first task', 'second task'],
    ),
    { start: 1, end: 1 },
  );
});

test('getMarkdownRangeForSelection lets native copy handle plain prose', () => {
  assert.equal(
    getMarkdownRangeForSelection(
      { lineIndex: 0, offset: 2 },
      { lineIndex: 1, offset: 3 },
      ['plain one', 'plain two'],
    ),
    null,
  );
});
