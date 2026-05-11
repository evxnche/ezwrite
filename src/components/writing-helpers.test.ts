import test from 'node:test';
import assert from 'node:assert/strict';

import {
  contentToHTML,
  contentToMarkdown,
  extractContent,
  getDropInsertionIndex,
  getDropTargetLineIndex,
  markdownToContent,
  STRUCK_MARKER,
  INDENT,
} from './writing-helpers';

type MockNode = MockTextNode | MockElementNode;

interface MockTextNode {
  nodeType: number;
  textContent: string;
}

interface MockElementNode {
  nodeType: number;
  dataset: Record<string, string>;
  tagName: string;
  contentEditable: string;
  childNodes: MockNode[];
  parentElement: MockElementNode | null;
  classList: {
    contains: (name: string) => boolean;
  };
  contains: (node: MockNode | null) => boolean;
  querySelector: (_selector: string) => MockElementNode | null;
}

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

function text(textContent: string): MockTextNode {
  return {
    nodeType: TEXT_NODE,
    textContent,
  };
}

function element({
  dataset = {},
  tagName = 'DIV',
  contentEditable = 'inherit',
  childNodes = [],
}: Partial<Omit<MockElementNode, 'nodeType' | 'classList' | 'querySelector'>> = {}): MockElementNode {
  const node: MockElementNode = {
    nodeType: ELEMENT_NODE,
    dataset,
    tagName,
    contentEditable,
    childNodes,
    parentElement: null,
    classList: {
      contains: () => false,
    },
    contains: (candidate) => {
      if (!candidate) return false;
      if (candidate === node) return true;
      return node.childNodes.some((child) =>
        child === candidate ||
        (child.nodeType === ELEMENT_NODE && (child as MockElementNode).contains(candidate))
      );
    },
    querySelector: () => null,
  };
  childNodes.forEach((child) => {
    if (child.nodeType === ELEMENT_NODE) {
      (child as MockElementNode).parentElement = node;
    }
  });
  return node;
}

test('extractContent keeps text typed as a top-level node in the first line', () => {
  (globalThis as typeof globalThis & { Node: { ELEMENT_NODE: number; TEXT_NODE: number } }).Node = {
    ELEMENT_NODE,
    TEXT_NODE,
  } as unknown as typeof Node;

  const editor = element({
    childNodes: [text('rewritten first line')],
  });

  assert.equal(extractContent(editor as unknown as HTMLElement), 'rewritten first line');
});

test('getDropTargetLineIndex uses the closest explicit data-line ancestor first', () => {
  const caption = element();
  const image = element({
    dataset: { line: '2' },
    childNodes: [caption],
  });
  const editor = element({
    childNodes: [element(), element(), image],
  });

  assert.equal(
    getDropTargetLineIndex(editor as unknown as HTMLElement, caption as unknown as EventTarget),
    2,
  );
});

test('getDropTargetLineIndex falls back to the containing editor child for plain text lines', () => {
  const nestedText = element();
  const textLine = element({
    childNodes: [nestedText],
  });
  const editor = element({
    childNodes: [element(), textLine, element()],
  });

  assert.equal(
    getDropTargetLineIndex(editor as unknown as HTMLElement, nestedText as unknown as EventTarget),
    1,
  );
});

test('getDropInsertionIndex prefers the drop target over the caret and appends after that line', () => {
  assert.equal(getDropInsertionIndex(4, 2, 0), 3);
});

test('contentToMarkdown emits checklist items with task markers and struck state', () => {
  const content = [
    'list',
    'open item',
    `${STRUCK_MARKER}done item`,
    `${INDENT}nested open`,
  ].join('\n');
  const md = contentToMarkdown(content);
  assert.match(md, /- \[ \] open item/);
  assert.match(md, /- \[x\] done item/);
  assert.match(md, / {2}- \[ \] nested open/);
});

test('contentToMarkdown range option limits output to selected lines', () => {
  const content = ['list', 'first', `${STRUCK_MARKER}second`, 'outside'].join('\n');
  const md = contentToMarkdown(content, { start: 1, end: 2 });
  assert.equal(md, '- [ ] first\n- [x] second');
});

test('markdownToContent re-hydrates checklist markdown into internal list format', () => {
  const md = ['- [ ] first', '- [x] second', '  - [ ] nested'].join('\n');
  const content = markdownToContent(md);
  assert.equal(
    content,
    ['list', 'first', `${STRUCK_MARKER}second`, `${INDENT}nested`].join('\n'),
  );
});

test('copy-then-paste round-trip preserves checklist state', () => {
  const original = ['list', 'todo', `${STRUCK_MARKER}done`].join('\n');
  const exported = contentToMarkdown(original).trimEnd();
  const roundTripped = markdownToContent(exported);
  assert.equal(roundTripped, original);
});

test('contentToHTML renders image blocks with native dragging disabled', () => {
  const html = contentToHTML('img::https://example.com/polaroid.jpg');

  assert.match(html, /class="ce-image-img"/);
  assert.match(html, /draggable="false"/);
});
