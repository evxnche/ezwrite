import test from 'node:test';
import assert from 'node:assert/strict';

import {
  contentToHTML,
  contentToMarkdown,
  extractContent,
  getSlashCommands,
  markdownToContent,
  stripLegacyImageLines,
  STRUCK_MARKER,
  INDENT,
} from './writing-helpers.ts';

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

test('getSlashCommands omits image when images are disabled', () => {
  const names = getSlashCommands(false).map((c) => c.name);
  assert.equal(names.includes('image'), false);
  assert.equal(names.includes('photo'), false);
});

test('getSlashCommands includes image when images are enabled', () => {
  const names = getSlashCommands(true).map((c) => c.name);
  assert.equal(names.includes('image'), true);
  assert.equal(names.includes('photo'), false);
});

test('stripLegacyImageLines removes stored image markers from legacy content', () => {
  assert.equal(
    stripLegacyImageLines('first\nimg::data:image/png;base64,abc\nsecond'),
    'first\nsecond',
  );
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

test('contentToHTML treats plain img:: text as normal editor text after image removal', () => {
  const html = contentToHTML('img::placeholder');

  assert.match(html, /data-type="text"/);
  assert.doesNotMatch(html, /ce-image/);
});
