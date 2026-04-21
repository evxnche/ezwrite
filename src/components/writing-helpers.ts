export const STRUCK_MARKER = '\u200B\u2713';
export const LIST_EXIT = '\u2060'; // word joiner — invisible, marks explicit list exit
export const INDENT = '        '; // 8 spaces

export const getCleanLine = (line: string) => line.startsWith(STRUCK_MARKER) ? line.slice(STRUCK_MARKER.length) : line;
export const isLineStruck = (line: string) => line.startsWith(STRUCK_MARKER);

export type LineType = 'text' | 'heading1' | 'heading2' | 'list-header' | 'list-item' | 'divider' | 'timer' | 'image' | 'quote';

export const SLASH_COMMANDS = [
  { name: 'list', description: 'Create a checklist' },
  { name: 'line', description: 'Insert a divider' },
  { name: 'timer', description: 'Start a timer' },
  { name: 'help', description: 'Show shortcuts & commands' },
];

export function getDropTargetLineIndex(editor: HTMLElement | null, target: EventTarget | null): number | null {
  if (!editor || !target || typeof target !== 'object') return null;

  let current = target as (HTMLElement | null);
  while (current) {
    const rawLine = current.dataset?.line;
    if (rawLine && /^\d+$/.test(rawLine)) {
      return parseInt(rawLine, 10);
    }
    current = current.parentElement;
  }

  const children = Array.from(editor.childNodes) as Array<Node & { contains?: (node: Node) => boolean }>;
  const targetNode = target as Node;
  const childIndex = children.findIndex((child) => child === targetNode || child.contains?.(targetNode));
  return childIndex >= 0 ? childIndex : null;
}

export function getDropInsertionIndex(
  lineCount: number,
  targetLineIndex: number | null,
  fallbackLineIndex: number | null,
): number {
  if (lineCount <= 0) return 0;
  const baseIndex = targetLineIndex ?? fallbackLineIndex ?? (lineCount - 1);
  const clampedBaseIndex = Math.max(-1, Math.min(baseIndex, lineCount - 1));
  return Math.min(clampedBaseIndex + 1, lineCount);
}

export function getLineType(lines: string[], index: number): LineType {
  const line = lines[index];
  if (line.startsWith('img::')) return 'image';
  if (line.startsWith(LIST_EXIT)) return 'text';
  const clean = getCleanLine(line).trim();
  const lower = clean.toLowerCase();
  if (lower === 'list') return 'list-header';
  if (lower === 'line') return 'divider';
  if (/^timer(\s|$)/i.test(lower)) return 'timer';
  if (/^## /.test(clean)) return 'heading2';
  if (/^# /.test(clean)) return 'heading1';
  if (/^>> /.test(clean) || clean === '>>') return 'quote';

  let emptyCount = 0;
  for (let i = index - 1; i >= 0; i--) {
    if (lines[i].startsWith(LIST_EXIT)) return 'text'; // explicit list break
    const c = getCleanLine(lines[i]).trim().toLowerCase();
    if (c === 'list') return 'list-item';
    if (c === 'line' || /^timer(\s|$)/i.test(c)) return 'text';
    if (/^##? /.test(getCleanLine(lines[i]).trim())) return 'text';
    if (c === '') {
      emptyCount++;
      if (emptyCount >= 2) return 'text';
    } else {
      emptyCount = 0;
    }
  }
  return 'text';
}

export function getTimerArgs(line: string): string {
  const clean = getCleanLine(line).trim();
  const match = clean.match(/^timer\s*(.*)/i);
  return match ? match[1].trim() : '';
}

// --- HTML helpers for contentEditable ---

export function escapeHTML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Wrap URLs in a styled span for visual signifier (Task 15)
function applyLinkHighlight(text: string): string {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  if (parts.length === 1) return escapeHTML(text); // no URLs
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      return `<span class="ce-link">${escapeHTML(part)}</span>`;
    }
    return escapeHTML(part);
  }).join('');
}

function parseImageLine(line: string): { src: string; width: string | null; caption: string } {
  let payload = line.slice('img::'.length);
  let caption = '';
  const capIdx = payload.indexOf('::cap::');
  if (capIdx !== -1) {
    caption = payload.slice(capIdx + 7);
    payload = payload.slice(0, capIdx);
  }
  const lastSep = payload.lastIndexOf('::');
  let src = payload;
  let width: string | null = null;
  if (lastSep > 0) {
    const possibleWidth = payload.slice(lastSep + 2);
    if (/^\d+$/.test(possibleWidth)) { width = possibleWidth; src = payload.slice(0, lastSep); }
  }
  return { src, width, caption };
}

interface ContentToHTMLOptions {
  editingTimerLine?: number;
}

export function contentToHTML(content: string, options?: ContentToHTMLOptions): string {
  if (!content) return '<div data-type="text"><br></div>';
  const lines = content.split('\n');
  return lines.map((line, i) => {
    const type = getLineType(lines, i);
    switch (type) {
      case 'heading1': {
        const escaped = escapeHTML(line.replace(/^# /, ''));
        return `<div data-type="heading1" data-heading-prefix="2" class="ce-heading1">${escaped || '<br>'}</div>`;
      }
      case 'heading2': {
        const escaped = escapeHTML(line.replace(/^## /, ''));
        return `<div data-type="heading2" data-heading-prefix="3" class="ce-heading2">${escaped || '<br>'}</div>`;
      }
      case 'list-header':
        return `<div data-type="list-header" contenteditable="false" class="ce-list-header"><span class="ce-lh-text">list</span><button class="ce-delete-btn" data-action="delete" data-line="${i}">✕</button></div>`;
      case 'divider':
        return `<div data-type="divider" contenteditable="false" class="ce-divider"><hr class="ce-hr"/><button class="ce-delete-btn" data-action="delete" data-line="${i}">✕</button></div>`;
      case 'timer': {
        if (options?.editingTimerLine === i) {
          return `<div data-type="text">${escapeHTML(line) || '<br>'}</div>`;
        }
        return `<div data-type="timer" data-timer-config="${escapeHTML(getTimerArgs(line))}" data-line="${i}" contenteditable="false" class="ce-timer" data-timer-slot="${i}"></div>`;
      }
      case 'image': {
        const { src, width: imgWidth, caption } = parseImageLine(line);
        const containerStyle = imgWidth ? ` style="width: ${imgWidth}px"` : ' style="width: 280px"';
        const dataWidth = imgWidth ? ` data-width="${imgWidth}"` : ' data-width="280"';
        const escapedCaption = escapeHTML(caption);
        return `<div data-type="image" contenteditable="false" class="ce-image" data-line="${i}"${dataWidth}${containerStyle}><div class="polaroid-inner"><img src="${src}" class="ce-image-img" alt="" draggable="false" /><div class="polaroid-caption" contenteditable="true" data-placeholder="add a title...">${escapedCaption}</div></div><div class="ce-image-resize-handle" data-action="resize" data-line="${i}"></div><button class="ce-delete-btn" data-action="delete" data-line="${i}">✕</button></div>`;
      }
      case 'quote': {
        const text = line.replace(/^>> ?/, '');
        return `<div data-type="quote" data-quote-prefix="1" class="ce-quote">${applyLinkHighlight(text) || '<br>'}</div>`;
      }
      case 'list-item': {
        const struck = isLineStruck(line);
        let clean = getCleanLine(line);
        // Strip indent prefix, apply as padding-left so checkbox moves with indent
        let indentLevel = 0;
        while (clean.startsWith(INDENT)) { indentLevel++; clean = clean.slice(INDENT.length); }
        const indentAttr = indentLevel > 0 ? ` data-indent="${indentLevel}" style="padding-left: ${indentLevel * 2}em"` : '';
        const escaped = escapeHTML(clean);
        return `<div data-type="list-item" data-struck="${struck}" data-line="${i}"${indentAttr} class="ce-list-item ${struck ? 'ce-struck' : ''}"><span contenteditable="false" class="ce-checkbox ${struck ? 'ce-checked' : ''}" data-action="toggle" data-line="${i}"></span><span class="ce-li-text">${escaped || '<br>'}</span></div>`;
      }
      default: {
        const isListExit = line.startsWith(LIST_EXIT);
        let displayLine = isListExit ? line.slice(LIST_EXIT.length) : line;
        const attr = isListExit ? ' data-list-exit="1"' : '';

        // Task 14: detect and strip indent prefix, apply CSS padding
        let indentLevel = 0;
        while (displayLine.startsWith(INDENT)) {
          indentLevel++;
          displayLine = displayLine.slice(INDENT.length);
        }
        const indentAttr = indentLevel > 0
          ? ` data-indent="${indentLevel}" style="padding-left: ${indentLevel * 2}em"`
          : '';

        // Task 15: apply URL highlighting
        const html = applyLinkHighlight(displayLine);

        return `<div data-type="text"${attr}${indentAttr}>${html || '<br>'}</div>`;
      }
    }
  }).join('');
}

export function extractContent(editor: HTMLElement): string {
  const lines: string[] = [];
  let looseText = '';

  const flushLooseText = () => {
    lines.push(looseText);
    looseText = '';
  };

  editor.childNodes.forEach(node => {
    if (node.nodeType === Node.TEXT_NODE) {
      looseText += node.textContent || '';
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as HTMLElement;
    const type = el.dataset.type;
    if (!type) {
      const tag = el.tagName.toUpperCase();
      if (tag === 'BR') {
        flushLooseText();
        return;
      }
      if (tag === 'DIV' || tag === 'P') {
        if (looseText) flushLooseText();
        lines.push(extractText(el));
        return;
      }
      looseText += extractText(el);
      return;
    }

    if (looseText) flushLooseText();
    if (type === 'list-header') { lines.push('list'); return; }
    if (type === 'divider') { lines.push('line'); return; }
    if (type === 'timer') {
      const config = el.dataset.timerConfig || '';
      lines.push(config ? `timer ${config}` : 'timer');
      return;
    }
    if (type === 'image') {
      const img = el.querySelector('img') as HTMLImageElement | null;
      const src = img?.getAttribute('src') || '';
      const width = (el as HTMLElement).dataset.width;
      const captionEl = el.querySelector('.polaroid-caption') as HTMLElement | null;
      const caption = captionEl?.textContent?.trim() || '';
      let stored = src ? `img::${src}` : '';
      if (width) stored += `::${width}`;
      if (caption) stored += `::cap::${caption}`;
      lines.push(stored);
      return;
    }
    if (type === 'heading1' || type === 'heading2') {
      const prefix = type === 'heading1' ? '# ' : '## ';
      lines.push(prefix + extractText(el));
      return;
    }
    if (type === 'quote') {
      lines.push('>> ' + extractText(el));
      return;
    }
    if (type === 'list-item') {
      const struck = el.dataset.struck === 'true';
      const textEl = el.querySelector('.ce-li-text');
      const text = extractText(textEl || el);
      const indentLevel = el.dataset.indent ? parseInt(el.dataset.indent) || 0 : 0;
      const prefix = (struck ? STRUCK_MARKER : '') + INDENT.repeat(indentLevel);
      lines.push(prefix + text);
      return;
    }
    // text type
    const text = extractText(el);
    // Task 14: prepend INDENT sequences if data-indent is set
    const indentLevel = el.dataset.indent ? parseInt(el.dataset.indent) || 0 : 0;
    const result = indentLevel > 0 ? INDENT.repeat(indentLevel) + text : text;
    lines.push(el.dataset.listExit === '1' ? LIST_EXIT + result : result);
  });

  if (looseText) flushLooseText();

  return lines.join('\n');
}

function extractText(el: Element): string {
  let result = '';
  el.childNodes.forEach(node => {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent || '';
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const htmlEl = node as HTMLElement;
      const tag = htmlEl.tagName.toUpperCase();
      if (tag === 'BR') {
        // ignore
      } else if (htmlEl.contentEditable === 'false' || htmlEl.classList.contains('ce-checkbox')) {
        // skip
      } else if (tag !== 'BUTTON') {
        result += extractText(htmlEl);
      }
    }
  });
  return result;
}

// Cursor helpers
export function setCursorPosition(editor: HTMLElement, lineIndex: number, offset: number) {
  const lineNode = editor.childNodes[lineIndex];
  if (!lineNode) return;

  const sel = window.getSelection();
  if (!sel) return;

  const range = document.createRange();
  let remaining = offset;

  // For list items, target the text span
  let targetNode: Node = lineNode;
  const el = lineNode as HTMLElement;
  if (el.dataset?.type === 'list-item') {
    const textSpan = el.querySelector('.ce-li-text');
    if (textSpan) targetNode = textSpan;
  }
  if (el.dataset?.headingPrefix) {
    remaining = Math.max(0, remaining - parseInt(el.dataset.headingPrefix));
  }

  function walkNodes(node: Node): boolean {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = (node.textContent || '').length;
      if (remaining <= len) {
        range.setStart(node, remaining);
        range.collapse(true);
        return true;
      }
      remaining -= len;
    } else {
      for (let i = 0; i < node.childNodes.length; i++) {
        const child = node.childNodes[i];
        if (child.nodeType === Node.ELEMENT_NODE) {
          const childEl = child as HTMLElement;
          if (childEl.contentEditable === 'false' || childEl.classList.contains('ce-checkbox')) continue;
        }
        if (walkNodes(child)) return true;
      }
    }
    return false;
  }

  if (!walkNodes(targetNode)) {
    range.selectNodeContents(targetNode);
    range.collapse(false);
  }

  sel.removeAllRanges();
  sel.addRange(range);
}

// Task 16: reusable markdown export utility
export function contentToMarkdown(content: string): string {
  if (!content.trim()) return '';
  const lines = content.split('\n');
  return lines.map((line, i) => {
    const type = getLineType(lines, i);
    if (type === 'divider') return '---';
    if (type === 'timer' || type === 'list-header') return '';
    if (type === 'image') {
      const { src, caption } = parseImageLine(line);
      return `![${caption || 'image'}](${src})`;
    }
    if (type === 'list-item') {
      const struck = isLineStruck(line);
      const clean = getCleanLine(line);
      return struck ? `- [x] ${clean}` : `- [ ] ${clean}`;
    }
    if (type === 'quote') return '> ' + line.replace(/^>> ?/, '');
    return line.startsWith(LIST_EXIT) ? line.slice(LIST_EXIT.length) : line;
  }).filter((line, i, arr) => !(line === '' && arr[i - 1] === ''))
    .join('\n') + '\n';
}
