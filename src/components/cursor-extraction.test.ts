import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractContent,
  getRawOffsetUpTo,
  setCursorPosition,
} from './writing-helpers.ts';

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

// ----- Mock DOM -----
type MockText = { nodeType: number; textContent: string };
type MockEl = {
  nodeType: number;
  tagName: string;
  dataset: Record<string, string>;
  contentEditable: string;
  childNodes: (MockText | MockEl)[];
  classList: { contains: (n: string) => boolean };
  parentElement: MockEl | null;
  contains: (n: MockText | MockEl | null) => boolean;
  querySelector: (selector: string) => MockEl | null;
};

function tx(content: string): MockText {
  return { nodeType: TEXT_NODE, textContent: content };
}

function el(opts: {
  tag?: string;
  dataset?: Record<string, string>;
  contentEditable?: string;
  classes?: string[];
  childNodes?: (MockText | MockEl)[];
} = {}): MockEl {
  const classes = opts.classes ?? [];
  const childNodes = opts.childNodes ?? [];
  const node: MockEl & { getAttribute: (k: string) => string | null } = {
    nodeType: ELEMENT_NODE,
    tagName: opts.tag ?? 'DIV',
    dataset: opts.dataset ?? {},
    contentEditable: opts.contentEditable ?? 'inherit',
    childNodes,
    classList: { contains: (n) => classes.includes(n) },
    parentElement: null,
    getAttribute(key: string) {
      if (key === 'href') return 'https://x.com';
      return null;
    },
    contains(cand) {
      if (!cand) return false;
      if (cand === this) return true;
      return this.childNodes.some((c) =>
        c === cand ||
        (c.nodeType === ELEMENT_NODE && (c as MockEl).contains(cand))
      );
    },
    querySelector(selector) {
      const match = selector.startsWith('.') ? selector.slice(1) : null;
      const find = (parent: MockEl): MockEl | null => {
        for (const c of parent.childNodes) {
          if (c.nodeType !== ELEMENT_NODE) continue;
          const e = c as MockEl;
          if (match && e.classList.contains(match)) return e;
          const inner = find(e);
          if (inner) return inner;
        }
        return null;
      };
      return find(this);
    },
  };
  childNodes.forEach((c) => {
    if (c.nodeType === ELEMENT_NODE) (c as MockEl).parentElement = node;
  });
  return node;
}

// Install Node global once (production code reads Node.TEXT_NODE / Node.ELEMENT_NODE)
(globalThis as unknown as { Node: { ELEMENT_NODE: number; TEXT_NODE: number } }).Node = {
  ELEMENT_NODE,
  TEXT_NODE,
};

// Selection mock for setCursorPosition tests
function installSelectionMock() {
  const captured: {
    startNode?: MockText | MockEl;
    startOffset?: number;
    collapsed?: boolean;
    selected?: MockText | MockEl;
  } = {};
  (globalThis as unknown as { window: unknown }).window = {
    getSelection: () => ({
      removeAllRanges: () => {},
      addRange: () => {},
    }),
  };
  (globalThis as unknown as { document: unknown }).document = {
    createRange: () => ({
      setStart: (n: MockText | MockEl, o: number) => {
        captured.startNode = n;
        captured.startOffset = o;
      },
      collapse: (v: boolean) => {
        captured.collapsed = v;
      },
      selectNodeContents: (n: MockText | MockEl) => {
        captured.selected = n;
      },
    }),
  };
  return captured;
}

// ====================================================================
// PART 1 — extractContent / extractText (Point 4: Perfect Extraction)
// ====================================================================

test('extract: STRONG → **bold**', () => {
  const editor = el({ childNodes: [
    el({ dataset: { type: 'text' }, childNodes: [
      el({ tag: 'STRONG', childNodes: [tx('bold')] }),
    ] }),
  ] });
  assert.equal(extractContent(editor as unknown as HTMLElement), '**bold**');
});

test('extract: B (alias) → **bold**', () => {
  const editor = el({ childNodes: [
    el({ dataset: { type: 'text' }, childNodes: [
      el({ tag: 'B', childNodes: [tx('bold')] }),
    ] }),
  ] });
  assert.equal(extractContent(editor as unknown as HTMLElement), '**bold**');
});

test('extract: EM → *italic*', () => {
  const editor = el({ childNodes: [
    el({ dataset: { type: 'text' }, childNodes: [
      el({ tag: 'EM', childNodes: [tx('italic')] }),
    ] }),
  ] });
  assert.equal(extractContent(editor as unknown as HTMLElement), '*italic*');
});

test('extract: I (alias) → *italic*', () => {
  const editor = el({ childNodes: [
    el({ dataset: { type: 'text' }, childNodes: [
      el({ tag: 'I', childNodes: [tx('italic')] }),
    ] }),
  ] });
  assert.equal(extractContent(editor as unknown as HTMLElement), '*italic*');
});

test('extract: DEL → ~~strike~~', () => {
  const editor = el({ childNodes: [
    el({ dataset: { type: 'text' }, childNodes: [
      el({ tag: 'DEL', childNodes: [tx('strike')] }),
    ] }),
  ] });
  assert.equal(extractContent(editor as unknown as HTMLElement), '~~strike~~');
});

test('extract: S (alias) → ~~strike~~', () => {
  const editor = el({ childNodes: [
    el({ dataset: { type: 'text' }, childNodes: [
      el({ tag: 'S', childNodes: [tx('strike')] }),
    ] }),
  ] });
  assert.equal(extractContent(editor as unknown as HTMLElement), '~~strike~~');
});

test('extract: STRIKE (alias) → ~~strike~~', () => {
  const editor = el({ childNodes: [
    el({ dataset: { type: 'text' }, childNodes: [
      el({ tag: 'STRIKE', childNodes: [tx('strike')] }),
    ] }),
  ] });
  assert.equal(extractContent(editor as unknown as HTMLElement), '~~strike~~');
});

test('extract: CODE → `code`', () => {
  const editor = el({ childNodes: [
    el({ dataset: { type: 'text' }, childNodes: [
      el({ tag: 'CODE', childNodes: [tx('code')] }),
    ] }),
  ] });
  assert.equal(extractContent(editor as unknown as HTMLElement), '`code`');
});

test('extract: plain text passes through unchanged', () => {
  const editor = el({ childNodes: [
    el({ dataset: { type: 'text' }, childNodes: [tx('just plain words')] }),
  ] });
  assert.equal(extractContent(editor as unknown as HTMLElement), 'just plain words');
});

test('extract: mixed text + STRONG', () => {
  const editor = el({ childNodes: [
    el({ dataset: { type: 'text' }, childNodes: [
      tx('I am '),
      el({ tag: 'STRONG', childNodes: [tx('bold')] }),
    ] }),
  ] });
  assert.equal(extractContent(editor as unknown as HTMLElement), 'I am **bold**');
});

test('extract: multiple inline markers on one line', () => {
  const editor = el({ childNodes: [
    el({ dataset: { type: 'text' }, childNodes: [
      el({ tag: 'STRONG', childNodes: [tx('a')] }),
      tx(' '),
      el({ tag: 'EM', childNodes: [tx('b')] }),
      tx(' '),
      el({ tag: 'CODE', childNodes: [tx('c')] }),
      tx(' '),
      el({ tag: 'DEL', childNodes: [tx('d')] }),
    ] }),
  ] });
  assert.equal(extractContent(editor as unknown as HTMLElement), '**a** *b* `c` ~~d~~');
});

test('extract: nested STRONG > EM → ***both***', () => {
  const editor = el({ childNodes: [
    el({ dataset: { type: 'text' }, childNodes: [
      el({ tag: 'STRONG', childNodes: [
        el({ tag: 'EM', childNodes: [tx('both')] }),
      ] }),
    ] }),
  ] });
  assert.equal(extractContent(editor as unknown as HTMLElement), '***both***');
});

test('extract: BR is ignored inside a line', () => {
  const editor = el({ childNodes: [
    el({ dataset: { type: 'text' }, childNodes: [
      tx('hello'),
      el({ tag: 'BR' }),
    ] }),
  ] });
  assert.equal(extractContent(editor as unknown as HTMLElement), 'hello');
});

test('extract: BUTTON content (e.g. delete-btn) is dropped', () => {
  const editor = el({ childNodes: [
    el({ dataset: { type: 'text' }, childNodes: [
      tx('keep me'),
      el({ tag: 'BUTTON', childNodes: [tx('✕')] }),
    ] }),
  ] });
  assert.equal(extractContent(editor as unknown as HTMLElement), 'keep me');
});

test('extract: contentEditable="false" subtree is skipped', () => {
  const editor = el({ childNodes: [
    el({ dataset: { type: 'text' }, childNodes: [
      tx('visible'),
      el({ tag: 'SPAN', contentEditable: 'false', childNodes: [tx('hidden')] }),
    ] }),
  ] });
  assert.equal(extractContent(editor as unknown as HTMLElement), 'visible');
});

test('extract: SPAN (link wrapper) unwraps to inner text without delimiters', () => {
  const editor = el({ childNodes: [
    el({ dataset: { type: 'text' }, childNodes: [
      el({ tag: 'SPAN', classes: ['ce-link'], childNodes: [tx('https://x.com')] }),
    ] }),
  ] });
  assert.equal(extractContent(editor as unknown as HTMLElement), 'https://x.com');
});

test('extract: empty STRONG (no inner text) still wraps in **', () => {
  const editor = el({ childNodes: [
    el({ dataset: { type: 'text' }, childNodes: [
      el({ tag: 'STRONG', childNodes: [] }),
    ] }),
  ] });
  assert.equal(extractContent(editor as unknown as HTMLElement), '****');
});

test('extract: heading line prefixes with # and unwraps STRONG inside heading text', () => {
  const editor = el({ childNodes: [
    el({ dataset: { type: 'heading1' }, childNodes: [
      tx('hello '),
      el({ tag: 'STRONG', childNodes: [tx('world')] }),
    ] }),
  ] });
  assert.equal(extractContent(editor as unknown as HTMLElement), '# hello **world**');
});

test('extract: quote line prefixes with >> and keeps inline markdown', () => {
  const editor = el({ childNodes: [
    el({ dataset: { type: 'quote' }, childNodes: [
      el({ tag: 'EM', childNodes: [tx('quoted')] }),
    ] }),
  ] });
  assert.equal(extractContent(editor as unknown as HTMLElement), '>> *quoted*');
});

test('extract: list-item with checkbox + struck state keeps inline markdown', () => {
  const checkbox = el({
    tag: 'SPAN',
    contentEditable: 'false',
    classes: ['ce-checkbox'],
  });
  const textSpan = el({
    tag: 'SPAN',
    classes: ['ce-li-text'],
    childNodes: [
      tx('do '),
      el({ tag: 'STRONG', childNodes: [tx('this')] }),
    ],
  });
  const editor = el({ childNodes: [
    el({ dataset: { type: 'list-header' }, childNodes: [
      el({ tag: 'SPAN', classes: ['ce-lh-text'], childNodes: [tx('rename list')] }),
    ] }),
    el({
      dataset: { type: 'list-item', struck: 'true' },
      childNodes: [checkbox, textSpan],
    }),
  ] });
  // list-header → 'list'; list-item → STRUCK_MARKER + 'do **this**'
  const result = extractContent(editor as unknown as HTMLElement);
  assert.ok(result.startsWith('list\n'), `expected list header, got ${JSON.stringify(result)}`);
  assert.ok(result.endsWith('do **this**'), `expected formatted list item, got ${JSON.stringify(result)}`);
});

// ====================================================================
// PART 2 — getRawOffsetUpTo (Point 3 forward: DOM click → raw offset)
// ====================================================================

test('forward: plain text node — offset N → N', () => {
  const t = tx('hello world');
  const line = el({ dataset: { type: 'text' }, childNodes: [t] });
  const { offset, found } = getRawOffsetUpTo(line as unknown as Node, t as unknown as Node, 5);
  assert.equal(found, true);
  assert.equal(offset, 5);
});

test('forward: click inside STRONG adds 2 prefix (** opening)', () => {
  const inner = tx('bold');
  const strong = el({ tag: 'STRONG', childNodes: [inner] });
  const line = el({ dataset: { type: 'text' }, childNodes: [tx('I am '), strong] });
  // "I am **bold**" — click between l and d (DOM offset 3 in "bold")
  const { offset, found } = getRawOffsetUpTo(line as unknown as Node, inner as unknown as Node, 3);
  assert.equal(found, true);
  assert.equal(offset, 5 + 2 + 3); // 'I am ' + ** + 'bol'
});

test('forward: click AFTER STRONG counts both opening and closing **', () => {
  const inner = tx('bold');
  const strong = el({ tag: 'STRONG', childNodes: [inner] });
  const trail = tx(' rest');
  const line = el({ dataset: { type: 'text' }, childNodes: [tx('I am '), strong, trail] });
  // DOM offset 2 in ' rest' → raw position past closing **
  const { offset, found } = getRawOffsetUpTo(line as unknown as Node, trail as unknown as Node, 2);
  assert.equal(found, true);
  assert.equal(offset, 5 + 2 + 4 + 2 + 2); // 'I am ' + ** + 'bold' + ** + ' r'
});

test('forward: EM adds 1 prefix', () => {
  const inner = tx('italic');
  const em = el({ tag: 'EM', childNodes: [inner] });
  const line = el({ dataset: { type: 'text' }, childNodes: [em] });
  const { offset } = getRawOffsetUpTo(line as unknown as Node, inner as unknown as Node, 6);
  assert.equal(offset, 1 + 6);
});

test('forward: CODE adds 1 prefix', () => {
  const inner = tx('code');
  const code = el({ tag: 'CODE', childNodes: [inner] });
  const line = el({ dataset: { type: 'text' }, childNodes: [code] });
  const { offset } = getRawOffsetUpTo(line as unknown as Node, inner as unknown as Node, 4);
  assert.equal(offset, 1 + 4);
});

test('forward: DEL adds 2 prefix', () => {
  const inner = tx('strike');
  const del = el({ tag: 'DEL', childNodes: [inner] });
  const line = el({ dataset: { type: 'text' }, childNodes: [del] });
  const { offset } = getRawOffsetUpTo(line as unknown as Node, inner as unknown as Node, 6);
  assert.equal(offset, 2 + 6);
});

test('forward: nested STRONG > EM adds 2 + 1 prefix', () => {
  const inner = tx('both');
  const em = el({ tag: 'EM', childNodes: [inner] });
  const strong = el({ tag: 'STRONG', childNodes: [em] });
  const line = el({ dataset: { type: 'text' }, childNodes: [strong] });
  const { offset } = getRawOffsetUpTo(line as unknown as Node, inner as unknown as Node, 4);
  assert.equal(offset, 2 + 1 + 4);
});

test('forward: contentEditable=false subtree contributes 0', () => {
  const hiddenInner = tx('hidden');
  const hidden = el({ tag: 'SPAN', contentEditable: 'false', childNodes: [hiddenInner] });
  const after = tx('after');
  const line = el({ dataset: { type: 'text' }, childNodes: [tx('a'), hidden, after] });
  const { offset, found } = getRawOffsetUpTo(line as unknown as Node, after as unknown as Node, 3);
  assert.equal(found, true);
  assert.equal(offset, 1 + 0 + 3); // 'a' + (hidden=0) + 'aft'
});

test('forward edge: target IS the line root — child-offset path counts hidden wrappers', () => {
  const a = tx('hello');
  const strong = el({ tag: 'STRONG', childNodes: [tx('XX')] });
  const line = el({ dataset: { type: 'text' }, childNodes: [a, strong] });
  // When the cursor is positioned at the line-div boundary after the strong
  // child, the raw offset must include both hidden ** wrappers.
  const { offset, found } = getRawOffsetUpTo(line as unknown as Node, line as unknown as Node, 2);
  assert.equal(found, true);
  assert.equal(offset, 5 + 2 + 2 + 2); // 'hello' + '**XX**'
});

test('forward edge: target IS a STRONG element at its end counts closing wrapper', () => {
  const inner = tx('bold');
  const strong = el({ tag: 'STRONG', childNodes: [inner] });
  const line = el({ dataset: { type: 'text' }, childNodes: [tx('I am '), strong] });
  const { offset, found } = getRawOffsetUpTo(line as unknown as Node, strong as unknown as Node, 1);
  assert.equal(found, true);
  assert.equal(offset, 5 + 2 + 4 + 2);
});

// ====================================================================
// PART 3 — setCursorPosition (Point 3 reverse: raw offset → DOM cursor)
// ====================================================================

test('reverse: plain text — offset N → (textNode, N)', () => {
  const cap = installSelectionMock();
  const t = tx('hello world');
  const line = el({ dataset: { type: 'text' }, childNodes: [t] });
  const editor = el({ childNodes: [line] });
  setCursorPosition(editor as unknown as HTMLElement, 0, 5);
  assert.equal(cap.startNode, t);
  assert.equal(cap.startOffset, 5);
});

test('reverse: raw offset inside bold lands inside text node "bold"', () => {
  const cap = installSelectionMock();
  const inner = tx('bold');
  const strong = el({ tag: 'STRONG', childNodes: [inner] });
  const line = el({ dataset: { type: 'text' }, childNodes: [tx('I am '), strong] });
  const editor = el({ childNodes: [line] });
  // raw "I am **bold**" → offset 10 = between l and d
  setCursorPosition(editor as unknown as HTMLElement, 0, 10);
  assert.equal(cap.startNode, inner);
  assert.equal(cap.startOffset, 3);
});

test('reverse: offset that lands inside opening ** clamps to start of element', () => {
  const cap = installSelectionMock();
  const inner = tx('bold');
  const strong = el({ tag: 'STRONG', childNodes: [inner] });
  const line = el({ dataset: { type: 'text' }, childNodes: [tx('I am '), strong] });
  const editor = el({ childNodes: [line] });
  // offset 6 = between the two opening asterisks
  setCursorPosition(editor as unknown as HTMLElement, 0, 6);
  assert.equal(cap.startNode, strong);
  assert.equal(cap.startOffset, 0);
});

test('reverse: offset at end of inner text (before closing **) lands at text end', () => {
  const cap = installSelectionMock();
  const inner = tx('bold');
  const strong = el({ tag: 'STRONG', childNodes: [inner] });
  const line = el({ dataset: { type: 'text' }, childNodes: [tx('I am '), strong] });
  const editor = el({ childNodes: [line] });
  // offset 11 = after 'd', before closing **
  setCursorPosition(editor as unknown as HTMLElement, 0, 11);
  assert.equal(cap.startNode, inner);
  assert.equal(cap.startOffset, 4);
});

test('reverse: offset past closing ** clamps to element end', () => {
  const cap = installSelectionMock();
  const inner = tx('bold');
  const strong = el({ tag: 'STRONG', childNodes: [inner] });
  const line = el({ dataset: { type: 'text' }, childNodes: [tx('I am '), strong] });
  const editor = el({ childNodes: [line] });
  // offset 13 = end of raw line "I am **bold**"
  setCursorPosition(editor as unknown as HTMLElement, 0, 13);
  assert.equal(cap.startNode, strong);
  assert.equal(cap.startOffset, 1); // childNodes.length
});

test('reverse: heading prefix is subtracted from raw offset', () => {
  const cap = installSelectionMock();
  const t = tx('Hello');
  const line = el({ dataset: { type: 'heading1', headingPrefix: '2' }, childNodes: [t] });
  const editor = el({ childNodes: [line] });
  // Raw line: "# Hello" → offset 5 = after 'Hel'. After subtracting '# '=2: DOM offset 3.
  setCursorPosition(editor as unknown as HTMLElement, 0, 5);
  assert.equal(cap.startNode, t);
  assert.equal(cap.startOffset, 3);
});

test('reverse: list-item targets the .ce-li-text span (skipping checkbox)', () => {
  const cap = installSelectionMock();
  const t = tx('task');
  const textSpan = el({ tag: 'SPAN', classes: ['ce-li-text'], childNodes: [t] });
  const checkbox = el({
    tag: 'SPAN',
    contentEditable: 'false',
    classes: ['ce-checkbox'],
  });
  const li = el({ dataset: { type: 'list-item' }, childNodes: [checkbox, textSpan] });
  const editor = el({ childNodes: [li] });
  setCursorPosition(editor as unknown as HTMLElement, 0, 2);
  assert.equal(cap.startNode, t);
  assert.equal(cap.startOffset, 2);
});

test('reverse: nested STRONG > EM — raw offset 5 (***bo***) lands inside "both"', () => {
  const cap = installSelectionMock();
  const inner = tx('both');
  const em = el({ tag: 'EM', childNodes: [inner] });
  const strong = el({ tag: 'STRONG', childNodes: [em] });
  const line = el({ dataset: { type: 'text' }, childNodes: [strong] });
  const editor = el({ childNodes: [line] });
  // raw "***both***" — offset 5 = right after 'bo' (***=3, b=3, o=4, position 5)
  setCursorPosition(editor as unknown as HTMLElement, 0, 5);
  assert.equal(cap.startNode, inner);
  assert.equal(cap.startOffset, 2);
});

// ====================================================================
// PART 4 — bidirectional round-trip (Point 3 + 4 together)
// ====================================================================

test('round-trip: forward then reverse returns to same DOM position (STRONG)', () => {
  const cap = installSelectionMock();
  const inner = tx('bold');
  const strong = el({ tag: 'STRONG', childNodes: [inner] });
  const line = el({ dataset: { type: 'text' }, childNodes: [tx('I am '), strong] });
  const editor = el({ childNodes: [line] });

  // User clicks at DOM offset 2 in "bold"
  const { offset: rawOffset } = getRawOffsetUpTo(
    line as unknown as Node,
    inner as unknown as Node,
    2,
  );
  // After structuralUpdate the cursor is restored from the raw offset.
  setCursorPosition(editor as unknown as HTMLElement, 0, rawOffset);

  assert.equal(cap.startNode, inner);
  assert.equal(cap.startOffset, 2);
});

test('round-trip: forward then reverse for nested STRONG > EM', () => {
  const cap = installSelectionMock();
  const inner = tx('both');
  const em = el({ tag: 'EM', childNodes: [inner] });
  const strong = el({ tag: 'STRONG', childNodes: [em] });
  const line = el({ dataset: { type: 'text' }, childNodes: [strong] });
  const editor = el({ childNodes: [line] });

  const { offset: rawOffset } = getRawOffsetUpTo(
    line as unknown as Node,
    inner as unknown as Node,
    3,
  );
  setCursorPosition(editor as unknown as HTMLElement, 0, rawOffset);

  assert.equal(cap.startNode, inner);
  assert.equal(cap.startOffset, 3);
});

test('round-trip: multiple cursor positions in a single line', () => {
  const inner = tx('bold');
  const strong = el({ tag: 'STRONG', childNodes: [inner] });
  const head = tx('I am ');
  const tail = tx(' here');
  const line = el({ dataset: { type: 'text' }, childNodes: [head, strong, tail] });
  const editor = el({ childNodes: [line] });

  // Only test offsets strictly INSIDE text nodes. The walker intentionally
  // collapses cursor positions that land at formatting boundaries to the
  // enclosing element (e.g. raw=7 with STRONG opening prefix → (strong, 0)
  // instead of (inner, 0)). Visually equivalent in a real browser but not
  // the same DOM position, so a strict round-trip check requires interior
  // offsets.
  const cases: Array<[MockText, number]> = [
    [head, 1], [head, 2], [head, 3], [head, 5],
    [inner, 1], [inner, 2], [inner, 3],
    [tail, 1], [tail, 3], [tail, 5],
  ];
  for (const [node, off] of cases) {
    const cap = installSelectionMock();
    const { offset: raw } = getRawOffsetUpTo(
      line as unknown as Node,
      node as unknown as Node,
      off,
    );
    setCursorPosition(editor as unknown as HTMLElement, 0, raw);
    assert.equal(cap.startNode, node, `case (${node.textContent}, ${off}) wrong node`);
    assert.equal(cap.startOffset, off, `case (${node.textContent}, ${off}) wrong offset`);
  }
});

// ====================================================================
// PART 5 — Symmetric prefix handling for indent / quote / heading
// `getCursorInfo` adds indent*8, quote*3, and headingPrefix to the saved
// offset. `setCursorPosition` must subtract all three so save/restore
// round-trips on indented, quoted, and heading lines.
// ====================================================================

test('symmetric: indent prefix is subtracted (8 chars per level)', () => {
  const cap = installSelectionMock();
  const t = tx('text'); // 4 chars
  const line = el({ dataset: { type: 'text', indent: '1' }, childNodes: [t] });
  const editor = el({ childNodes: [line] });
  // Raw offset 10 = 8 indent chars + 'te' (2 in visible text)
  setCursorPosition(editor as unknown as HTMLElement, 0, 10);
  assert.equal(cap.startNode, t);
  assert.equal(cap.startOffset, 2);
});

test('symmetric: quote prefix is subtracted (3 chars for ">> ")', () => {
  const cap = installSelectionMock();
  const t = tx('hi'); // 2 chars
  const line = el({ dataset: { type: 'quote', quotePrefix: '3' }, childNodes: [t] });
  const editor = el({ childNodes: [line] });
  // Raw ">> hi" → offset 4 = after 'h'. Subtract 3 → DOM offset 1.
  setCursorPosition(editor as unknown as HTMLElement, 0, 4);
  assert.equal(cap.startNode, t);
  assert.equal(cap.startOffset, 1);
});

test('symmetric: heading prefix is subtracted (2 or 3 chars for # / ##)', () => {
  const cap = installSelectionMock();
  const t = tx('Hello');
  const line = el({ dataset: { type: 'heading1', headingPrefix: '2' }, childNodes: [t] });
  const editor = el({ childNodes: [line] });
  setCursorPosition(editor as unknown as HTMLElement, 0, 4);
  assert.equal(cap.startNode, t);
  assert.equal(cap.startOffset, 2);
});

test('symmetric: indent + list-item also round-trips correctly', () => {
  const cap = installSelectionMock();
  const t = tx('task');
  const textSpan = el({ tag: 'SPAN', classes: ['ce-li-text'], childNodes: [t] });
  const checkbox = el({
    tag: 'SPAN',
    contentEditable: 'false',
    classes: ['ce-checkbox'],
  });
  const li = el({
    dataset: { type: 'list-item', indent: '1' },
    childNodes: [checkbox, textSpan],
  });
  const editor = el({ childNodes: [li] });
  // Raw offset 10 = 8 indent + 'ta' (2 in visible text)
  setCursorPosition(editor as unknown as HTMLElement, 0, 10);
  assert.equal(cap.startNode, t);
  assert.equal(cap.startOffset, 2);
});
