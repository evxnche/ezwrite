export const STRUCK_MARKER = '\u200B\u2713';
export const INDENT = '        '; // 8 spaces

export const getCleanLine = (line: string) => line.startsWith(STRUCK_MARKER) ? line.slice(STRUCK_MARKER.length) : line;
export const isLineStruck = (line: string) => line.startsWith(STRUCK_MARKER);

export type LineType = 'text' | 'heading1' | 'heading2' | 'list-header' | 'list-item' | 'divider' | 'timer';

export const SLASH_COMMANDS = [
  { name: 'list', description: 'Create a checklist' },
  { name: 'line', description: 'Insert a divider' },
  { name: 'timer', description: 'Start a timer' },
];

export function getLineType(lines: string[], index: number): LineType {
  const clean = getCleanLine(lines[index]).trim();
  const lower = clean.toLowerCase();
  if (lower === 'list') return 'list-header';
  if (lower === 'line') return 'divider';
  if (/^timer(\s|$)/i.test(lower)) return 'timer';
  if (/^## /.test(clean)) return 'heading2';
  if (/^# /.test(clean)) return 'heading1';

  let emptyCount = 0;
  for (let i = index - 1; i >= 0; i--) {
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
        const escaped = escapeHTML(line);
        return `<div data-type="heading1" class="ce-heading1">${escaped || '<br>'}</div>`;
      }
      case 'heading2': {
        const escaped = escapeHTML(line);
        return `<div data-type="heading2" class="ce-heading2">${escaped || '<br>'}</div>`;
      }
      case 'list-header':
        return `<div data-type="list-header" contenteditable="false" class="ce-list-header"><span class="ce-lh-text">list</span><button class="ce-delete-btn" data-action="delete" data-line="${i}">✕</button></div>`;
      case 'divider':
        return `<div data-type="divider" contenteditable="false" class="ce-divider"><hr class="ce-hr"/><button class="ce-delete-btn" data-action="delete" data-line="${i}">✕</button></div>`;
      case 'timer': {
        if (options?.editingTimerLine === i) {
          // Render as editable text while user is typing timer args
          return `<div data-type="text">${escapeHTML(line) || '<br>'}</div>`;
        }
        return `<div data-type="timer" data-timer-config="${escapeHTML(getTimerArgs(line))}" data-line="${i}" contenteditable="false" class="ce-timer" data-timer-slot="${i}"></div>`;
      }
      case 'list-item': {
        const struck = isLineStruck(line);
        const clean = getCleanLine(line);
        const escaped = escapeHTML(clean);
        return `<div data-type="list-item" data-struck="${struck}" data-line="${i}" class="ce-list-item ${struck ? 'ce-struck' : ''}"><span contenteditable="false" class="ce-checkbox ${struck ? 'ce-checked' : ''}" data-action="toggle" data-line="${i}"></span><span class="ce-li-text">${escaped || '<br>'}</span></div>`;
      }
      default: {
        const escaped = escapeHTML(line);
        return `<div data-type="text">${escaped || '<br>'}</div>`;
      }
    }
  }).join('');
}

export function extractContent(editor: HTMLElement): string {
  const lines: string[] = [];
  editor.childNodes.forEach(node => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const type = el.dataset.type;
    if (type === 'list-header') { lines.push('list'); return; }
    if (type === 'divider') { lines.push('line'); return; }
    if (type === 'timer') {
      const config = el.dataset.timerConfig || '';
      lines.push(config ? `timer ${config}` : 'timer');
      return;
    }
    if (type === 'heading1' || type === 'heading2') {
      lines.push(extractText(el));
      return;
    }
    if (type === 'list-item') {
      const struck = el.dataset.struck === 'true';
      const textEl = el.querySelector('.ce-li-text');
      const text = extractText(textEl || el);
      lines.push(struck ? STRUCK_MARKER + text : text);
      return;
    }
    const text = extractText(el);
    lines.push(text);
  });
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
