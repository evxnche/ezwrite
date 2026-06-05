export const STRUCK_MARKER = '\u200B\u2713';
export const LIST_EXIT = '\u2060'; // word joiner — invisible, marks explicit list exit
export const INDENT = '        '; // 8 spaces
export const NBSP = '\u00A0';
export const NBSP_PER_INDENT = 4; // visible spaces per indent level in wysiwyg export

export const getCleanLine = (line: string) => line.startsWith(STRUCK_MARKER) ? line.slice(STRUCK_MARKER.length) : line;
export const isLineStruck = (line: string) => line.startsWith(STRUCK_MARKER);

/** Check if a line is a list header (plain 'list' or 'list::name'). */
export function isListHeader(lower: string): boolean {
  return lower === 'list' || lower.startsWith('list::');
}

/** Extract the display name from a list header line. Returns 'rename list' for unnamed. */
export function getListName(line: string): string {
  const clean = getCleanLine(line).trim();
  const match = clean.match(/^list::(.+)$/i);
  return match ? match[1] : 'rename list';
}

export type LineType = 'text' | 'heading1' | 'heading2' | 'list-header' | 'list-item' | 'divider' | 'timer' | 'quote' | 'image' | 'voice';

const SLASH_COMMANDS_BASE = [
  { name: 'list', description: 'Create a checklist' },
  { name: 'line', description: 'Insert a divider' },
  { name: 'timer', description: 'Start a timer' },
  { name: 'sidetab', description: 'Toggle side tab' },
  { name: 'scratchpad', description: 'Toggle scratchpad' },
  { name: 'help', description: 'Show help' },
  { name: 'settings', description: 'Open settings' },
] as const;

const IMAGE_SLASH_COMMAND = { name: 'image', description: 'Insert an image' } as const;
const VOICE_SLASH_COMMAND = { name: 'voice', description: 'Record a voice note' } as const;

export type SlashCommand = { name: string; description: string };

export interface SlashCommandOptions {
  imagesEnabled?: boolean;
  voicesEnabled?: boolean;
  sidetabEnabled?: boolean;
  scratchpadEnabled?: boolean;
  listEnabled?: boolean;
  lineEnabled?: boolean;
  timerEnabled?: boolean;
  helpEnabled?: boolean;
  settingsCommandEnabled?: boolean;
}

export function getSlashCommands(options: SlashCommandOptions = {}): SlashCommand[] {
  let commands: SlashCommand[] = [...SLASH_COMMANDS_BASE];
  
  if (options.imagesEnabled !== false) {
    const timerIndex = commands.findIndex(c => c.name === 'timer');
    commands.splice(timerIndex + 1, 0, IMAGE_SLASH_COMMAND);
  }

  if (options.voicesEnabled !== false) {
    const imageIndex = commands.findIndex(c => c.name === 'image');
    const insertAt = imageIndex >= 0 ? imageIndex + 1 : commands.findIndex(c => c.name === 'timer') + 1;
    commands.splice(insertAt, 0, VOICE_SLASH_COMMAND);
  }
  
  if (options.sidetabEnabled === false) commands = commands.filter(c => c.name !== 'sidetab');
  if (options.scratchpadEnabled === false) commands = commands.filter(c => c.name !== 'scratchpad');
  if (options.listEnabled === false) commands = commands.filter(c => c.name !== 'list');
  if (options.lineEnabled === false) commands = commands.filter(c => c.name !== 'line');
  if (options.timerEnabled === false) commands = commands.filter(c => c.name !== 'timer');
  if (options.helpEnabled === false) commands = commands.filter(c => c.name !== 'help');
  if (options.settingsCommandEnabled === false) commands = commands.filter(c => c.name !== 'settings');

  return commands;
}

/** Default slash commands (all on) for modules that don't read user prefs. */
export const SLASH_COMMANDS = getSlashCommands();

export function stripLegacyImageLines(content: string): string {
  return content
    .split('\n')
    .filter((line) => !line.startsWith('img::'))
    .join('\n');
}

export function getLineType(lines: string[], index: number): LineType {
  const line = lines[index];
  if (line.startsWith(LIST_EXIT)) return 'text';
  const clean = getCleanLine(line).trim();
  const lower = clean.toLowerCase();
  if (isListHeader(lower)) return 'list-header';
  if (lower === 'line') return 'divider';
  if (/^timer(\s|$)/i.test(lower)) return 'timer';
  if (/^polaroid::/.test(clean)) return 'image';
  if (/^voice::/.test(clean)) return 'voice';
  if (/^## /.test(clean)) return 'heading2';
  if (/^# /.test(clean)) return 'heading1';
  if (/^>> /.test(clean) || clean === '>>') return 'quote';

  let emptyCount = 0;
  for (let i = index - 1; i >= 0; i--) {
    if (lines[i].startsWith(LIST_EXIT)) return 'text'; // explicit list break
    const c = getCleanLine(lines[i]).trim().toLowerCase();
    if (isListHeader(c)) return 'list-item';
    if (c === 'line' || /^timer(\s|$)/i.test(c) || /^polaroid::/.test(getCleanLine(lines[i]).trim()) || /^voice::/.test(getCleanLine(lines[i]).trim())) return 'text';
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

const getInlineWrapperWidth = (tagName: string): number => {
  const tag = tagName.toUpperCase();
  if (tag === 'STRONG' || tag === 'B' || tag === 'DEL' || tag === 'S' || tag === 'STRIKE') return 2;
  if (tag === 'EM' || tag === 'I' || tag === 'CODE') return 1;
  return 0;
};

export function hasRenderableInlineMarkdown(text: string): boolean {
  return /(^|[^\\])(\*\*|__|~~|`)(.+?)\2/.test(text) ||
    /(^|[^\\*_])(\*|_)(?!\2)(.+?)\2/.test(text);
}

export function escapeHTML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function applyInlineFormatting(text: string): string {
  let html = text;
  // bold: ** or __
  html = html.replace(/(^|[^\\])(\*\*|__)(.+?)\2/g, '$1<strong>$3</strong>');
  // italic: * or _
  html = html.replace(/(^|[^\\*_])(\*|_)(?!\2)(.+?)\2/g, '$1<em>$3</em>');
  // strikethrough: ~~
  html = html.replace(/(^|[^\\])(~~)(.+?)\2/g, '$1<del>$3</del>');
  // code: `
  html = html.replace(/(^|[^\\])(`)(.+?)\2/g, '$1<code>$3</code>');
  return html;
}

function applyLinkHighlight(text: string): string {
  const regex = /(\[[^\]]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s<]+)/g;
  const parts = text.split(regex);
  if (parts.length === 1) return applyInlineFormatting(escapeHTML(text));
  
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      const mdMatch = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
      if (mdMatch) {
        return `<a href="${escapeHTML(mdMatch[2])}" class="ce-link" target="_blank" rel="noopener noreferrer" contenteditable="false" data-action="link">${applyInlineFormatting(escapeHTML(mdMatch[1]))}</a>`;
      } else {
        return `<a href="${escapeHTML(part)}" class="ce-link" target="_blank" rel="noopener noreferrer" contenteditable="false" data-action="link">${applyInlineFormatting(escapeHTML(part))}</a>`;
      }
    }
    return applyInlineFormatting(escapeHTML(part));
  }).join('');
}

interface ContentToHTMLOptions {
  editingTimerLine?: number;
  hideUnnamedListHeaders?: boolean;
}

export function contentToHTML(content: string, options?: ContentToHTMLOptions): string {
  if (!content) return '<div data-type="text"><br></div>';
  const lines = content.split('\n');
  return lines.map((line, i) => {
    const type = getLineType(lines, i);
    switch (type) {
      case 'heading1': {
        const html = applyLinkHighlight(line.replace(/^# /, ''));
        return `<div data-type="heading1" data-heading-prefix="2" class="ce-heading1">${html || '<br>'}</div>`;
      }
      case 'heading2': {
        const html = applyLinkHighlight(line.replace(/^## /, ''));
        return `<div data-type="heading2" data-heading-prefix="3" class="ce-heading2">${html || '<br>'}</div>`;
      }
      case 'list-header': {
        const listName = getListName(line);
        const escapedName = escapeHTML(listName);
        const unnamed = getCleanLine(line).trim().toLowerCase() === 'list';
        const hiddenAttr = unnamed && options?.hideUnnamedListHeaders ? ' data-list-unnamed="1"' : '';
        return `<div data-type="list-header"${hiddenAttr} contenteditable="false" class="ce-list-header"><span class="ce-lh-text" data-action="rename-list" data-line="${i}">${escapedName}</span><button class="ce-delete-btn" data-action="delete" data-line="${i}">✕</button></div>`;
      }
      case 'divider':
        return `<div data-type="divider" contenteditable="false" class="ce-divider"><hr class="ce-hr"/><button class="ce-delete-btn" data-action="delete" data-line="${i}">✕</button></div>`;
      case 'timer': {
        if (options?.editingTimerLine === i) {
          return `<div data-type="text">${escapeHTML(line) || '<br>'}</div>`;
        }
        return `<div data-type="timer" data-timer-config="${escapeHTML(getTimerArgs(line))}" data-line="${i}" contenteditable="false" class="ce-timer" data-timer-slot="${i}"></div>`;
      }
      case 'image': {
        const m = line.match(/^polaroid::([^|]+)\|?([^|]*)?\|?(.*)?$/);
        const id = escapeHTML(m?.[1] ?? '');
        const caption = escapeHTML(m?.[2] ?? '');
        const width = m?.[3] ? escapeHTML(m[3]) : '';
        const widthAttr = width ? ` data-image-width="${width}"` : '';
        return `<div data-type="image" data-image-id="${id}" data-image-caption="${caption}"${widthAttr} data-image-slot="${i}" contenteditable="false" class="ce-image"></div>`;
      }
      case 'voice': {
        const m = line.match(/^voice::([^|]+)\|?([^|]*)?\|?(.*)?$/);
        const id = escapeHTML(m?.[1] ?? '');
        const label = escapeHTML(m?.[2] ?? '');
        const duration = escapeHTML(m?.[3] ?? '');
        return `<div data-type="voice" data-voice-id="${id}" data-voice-label="${label}" data-voice-duration="${duration}" data-voice-slot="${i}" contenteditable="false" class="ce-voice"></div>`;
      }
      case 'quote': {
        const text = line.replace(/^>> ?/, '');
        return `<div data-type="quote" data-quote-prefix="3" class="ce-quote">${applyLinkHighlight(text) || '<br>'}</div>`;
      }
      case 'list-item': {
        const struck = isLineStruck(line);
        let clean = getCleanLine(line);
        // Strip indent prefix, apply as padding-left so checkbox moves with indent
        let indentLevel = 0;
        while (clean.startsWith(INDENT)) { indentLevel++; clean = clean.slice(INDENT.length); }
        const indentAttr = indentLevel > 0 ? ` data-indent="${indentLevel}" style="padding-left: ${indentLevel * 2}em"` : '';
        const html = applyLinkHighlight(clean);
        return `<div data-type="list-item" data-struck="${struck}" data-line="${i}"${indentAttr} class="ce-list-item ${struck ? 'ce-struck' : ''}"><span contenteditable="false" class="ce-checkbox ${struck ? 'ce-checked' : ''}" data-action="toggle" data-line="${i}"></span><span class="ce-li-text">${html || '<br>'}</span></div>`;
      }
      default: {
        const isListExit = line.startsWith(LIST_EXIT);
        let displayLine = isListExit ? line.slice(LIST_EXIT.length) : line;
        const attr = isListExit ? ' data-list-exit="1"' : '';

        let indentLevel = 0;
        while (displayLine.startsWith(INDENT)) {
          indentLevel++;
          displayLine = displayLine.slice(INDENT.length);
        }
        const indentAttr = indentLevel > 0
          ? ` data-indent="${indentLevel}" style="padding-left: ${indentLevel * 2}em"`
          : '';

        const html = applyLinkHighlight(displayLine);

        return `<div data-type="text"${attr}${indentAttr}>${html || '<br>'}</div>`;
      }
    }
  }).join('');
}

/** Map a DOM selection point to a line index + offset in the internal content string. */
export function getLineOffsetFromDOMPoint(
  editor: HTMLElement,
  container: Node,
  domOffset: number,
): { lineIndex: number; offset: number } | null {
  const children = Array.from(editor.childNodes) as HTMLElement[];
  let lineIndex = -1;
  let lineEl: HTMLElement | null = null;

  if (container === editor) {
    lineIndex = Math.max(0, Math.min(domOffset > 0 ? domOffset - 1 : 0, children.length - 1));
    lineEl = children[lineIndex] || null;
    if (!lineEl) return null;
    return {
      lineIndex,
      offset: domOffset > lineIndex ? (lineEl.textContent?.length ?? 0) : 0,
    };
  }

  for (let i = 0; i < children.length; i++) {
    if (children[i].contains(container)) {
      lineIndex = i;
      lineEl = children[i];
      break;
    }
  }

  if (lineIndex < 0 || !lineEl) return null;

  let textContainer: Node = lineEl;
  if (lineEl.dataset?.type === 'list-item') {
    const textSpan = lineEl.querySelector('.ce-li-text');
    if (textSpan) textContainer = textSpan;
  }

  let offset = 0;
  try {
    const result = getRawOffsetUpTo(textContainer, container, domOffset);
    offset = result.offset;
  } catch {
    offset = 0;
  }

  if (lineEl.dataset?.indent) offset += parseInt(lineEl.dataset.indent, 10) * INDENT.length;
  if (lineEl.dataset?.quotePrefix) offset += 3;
  if (lineEl.dataset?.headingPrefix) offset += parseInt(lineEl.dataset.headingPrefix, 10);

  return { lineIndex, offset };
}

function orderLinePoints(
  a: { lineIndex: number; offset: number },
  b: { lineIndex: number; offset: number },
): [{ lineIndex: number; offset: number }, { lineIndex: number; offset: number }] {
  if (a.lineIndex < b.lineIndex || (a.lineIndex === b.lineIndex && a.offset <= b.offset)) {
    return [a, b];
  }
  return [b, a];
}

/** Slice internal content for the current editor selection (preserves [text](url) markdown). */
export function extractContentSliceForSelection(
  editor: HTMLElement,
  content: string,
  selection: Selection,
): string {
  if (!selection.rangeCount) return '';
  const range = selection.getRangeAt(0);
  if (range.collapsed) return '';
  if (!editor.contains(range.commonAncestorContainer)) return selection.toString();

  const startPoint = getLineOffsetFromDOMPoint(editor, range.startContainer, range.startOffset);
  const endPoint = getLineOffsetFromDOMPoint(editor, range.endContainer, range.endOffset);
  if (!startPoint || !endPoint) return selection.toString();

  const lines = content.split('\n');
  let [first, last] = orderLinePoints(startPoint, endPoint);

  // Selection ending at the start of the next line should not include that line.
  if (last.offset === 0 && last.lineIndex > first.lineIndex) {
    const endLine = last.lineIndex - 1;
    last = { lineIndex: endLine, offset: lines[endLine]?.length ?? 0 };
  }

  if (first.lineIndex === last.lineIndex) {
    return (lines[first.lineIndex] ?? '').slice(first.offset, last.offset);
  }

  const chunks: string[] = [];
  chunks.push((lines[first.lineIndex] ?? '').slice(first.offset));
  for (let i = first.lineIndex + 1; i < last.lineIndex; i++) {
    chunks.push(lines[i] ?? '');
  }
  chunks.push((lines[last.lineIndex] ?? '').slice(0, last.offset));
  return chunks.join('\n');
}

/** Extract selection text, preserving link markup as [text](url) or raw URL. */
export function extractSelectionWithLinks(
  selection: Selection,
  editor?: HTMLElement | null,
  content?: string,
): string {
  if (editor && content != null) {
    return extractContentSliceForSelection(editor, content, selection);
  }
  if (!selection.rangeCount) return selection.toString();
  const range = selection.getRangeAt(0);
  const temp = document.createElement('div');
  temp.appendChild(range.cloneContents());
  if (!temp.querySelector('.ce-link, a[href]')) {
    return selection.toString();
  }
  return extractContent(temp).replace(/\n$/, '');
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
    if (type === 'list-header') {
      const textEl = el.querySelector('.ce-lh-text');
      const name = textEl ? (textEl.textContent || 'rename list').trim() : 'rename list';
      lines.push(name.toLowerCase() === 'rename list' ? 'list' : `list::${name}`);
      return;
    }
    if (type === 'divider') { lines.push('line'); return; }
    if (type === 'timer') {
      const config = el.dataset.timerConfig || '';
      lines.push(config ? `timer ${config}` : 'timer');
      return;
    }
    if (type === 'image') {
      const id = el.dataset.imageId || '';
      const caption = el.dataset.imageCaption || '';
      const width = el.dataset.imageWidth || '';
      lines.push(width ? `polaroid::${id}|${caption}|${width}` : `polaroid::${id}|${caption}`);
      return;
    }
    if (type === 'voice') {
      const id = el.dataset.voiceId || '';
      const label = el.dataset.voiceLabel || '';
      const duration = el.dataset.voiceDuration || '';
      lines.push(duration ? `voice::${id}|${label}|${duration}` : `voice::${id}|${label}`);
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
    const indentLevel = el.dataset.indent ? parseInt(el.dataset.indent) || 0 : 0;
    const result = indentLevel > 0 ? INDENT.repeat(indentLevel) + text : text;
    lines.push(el.dataset.listExit === '1' ? LIST_EXIT + result : result);
  });

  if (looseText) flushLooseText();

  return lines.join('\n');
}

function linkElementToMarkdown(htmlEl: HTMLElement): string {
  const url = (typeof htmlEl.getAttribute === 'function' ? htmlEl.getAttribute('href') : '') || htmlEl.dataset?.url || '';
  const innerText = Array.from(htmlEl.childNodes).map(child => {
    if (child.nodeType === Node.TEXT_NODE) return child.textContent || '';
    if (child.nodeType === Node.ELEMENT_NODE) {
      const childEl = child as HTMLElement;
      const childTag = childEl.tagName.toUpperCase();
      const childText = extractText(childEl);
      if (childTag === 'STRONG' || childTag === 'B') return '**' + childText + '**';
      if (childTag === 'EM' || childTag === 'I') return '*' + childText + '*';
      if (childTag === 'DEL' || childTag === 'S' || childTag === 'STRIKE') return '~~' + childText + '~~';
      if (childTag === 'CODE') return '`' + childText + '`';
      return childText;
    }
    return '';
  }).join('');
  if (innerText && innerText !== url && innerText !== escapeHTML(url)) {
    return `[${innerText}](${url})`;
  }
  return url;
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
      } else if (htmlEl.classList.contains('ce-link')) {
        result += linkElementToMarkdown(htmlEl);
      } else if (htmlEl.contentEditable === 'false' || htmlEl.classList.contains('ce-checkbox')) {
        // skip
      } else if (tag !== 'BUTTON') {
        const innerText = extractText(htmlEl);
        if (tag === 'STRONG' || tag === 'B') result += '**' + innerText + '**';
        else if (tag === 'EM' || tag === 'I') result += '*' + innerText + '*';
        else if (tag === 'DEL' || tag === 'S' || tag === 'STRIKE') result += '~~' + innerText + '~~';
        else if (tag === 'CODE') result += '`' + innerText + '`';
        else result += innerText;
      }
    }
  });
  return result;
}

function getRawTextLength(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent || '').length;
  if (node.nodeType !== Node.ELEMENT_NODE) return 0;

  const el = node as HTMLElement;
  const tag = el.tagName.toUpperCase();
  if (el.classList.contains('ce-link')) {
    return linkElementToMarkdown(el).length;
  }
  if (tag === 'BR' || tag === 'BUTTON' || el.contentEditable === 'false' || el.classList.contains('ce-checkbox')) {
    return 0;
  }

  const wrapperWidth = getInlineWrapperWidth(tag);
  let total = wrapperWidth;
  node.childNodes.forEach((child) => {
    total += getRawTextLength(child);
  });
  return total + wrapperWidth;
}

export function getRawOffsetUpTo(root: Node, targetContainer: Node, targetOffset: number): { offset: number, found: boolean } {
  if (root === targetContainer) {
    if (root.nodeType === Node.TEXT_NODE) return { offset: targetOffset, found: true };
    const rootWrapperWidth = root.nodeType === Node.ELEMENT_NODE
      ? getInlineWrapperWidth((root as HTMLElement).tagName)
      : 0;
    let offset = 0;
    if (rootWrapperWidth > 0) offset += rootWrapperWidth;
    for (let i = 0; i < targetOffset; i++) {
      offset += getRawTextLength(root.childNodes[i]);
    }
    if (rootWrapperWidth > 0 && targetOffset >= root.childNodes.length) offset += rootWrapperWidth;
    return { offset, found: true };
  }
  
  if (root.nodeType === Node.TEXT_NODE) {
    return { offset: (root.textContent || '').length, found: false };
  }
  
  let total = 0;
  if (root.nodeType === Node.ELEMENT_NODE) {
    const el = root as HTMLElement;
    if (el.classList.contains('ce-link')) {
      const len = linkElementToMarkdown(el).length;
      if (el === targetContainer || el.contains(targetContainer)) {
        return { offset: len, found: true };
      }
      return { offset: len, found: false };
    }
    if (el.contentEditable === 'false' || el.classList.contains('ce-checkbox')) return { offset: 0, found: false };
    
    const tag = el.tagName.toUpperCase();
    const prefix = getInlineWrapperWidth(tag);
    
    total += prefix;
    
    for (let i = 0; i < root.childNodes.length; i++) {
      const res = getRawOffsetUpTo(root.childNodes[i], targetContainer, targetOffset);
      total += res.offset;
      if (res.found) return { offset: total, found: true };
    }
    
    total += prefix; // suffix if not found inside
  }
  return { offset: total, found: false };
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
  if (el.dataset?.indent) {
    remaining = Math.max(0, remaining - parseInt(el.dataset.indent) * INDENT.length);
  }
  if (el.dataset?.quotePrefix) {
    remaining = Math.max(0, remaining - parseInt(el.dataset.quotePrefix));
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
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el.classList.contains('ce-link')) {
        const len = linkElementToMarkdown(el).length;
        if (remaining <= len) {
          if (remaining <= 0) range.setStartBefore(el);
          else if (remaining >= len) range.setStartAfter(el);
          else range.setStartBefore(el);
          range.collapse(true);
          return true;
        }
        remaining -= len;
        return false;
      }
      if (el.contentEditable === 'false' || el.classList.contains('ce-checkbox')) return false;

      const tag = el.tagName.toUpperCase();
      const prefix = getInlineWrapperWidth(tag);

      if (remaining <= prefix) {
         range.setStart(node, 0);
         range.collapse(true);
         return true;
      }
      remaining -= prefix;

      for (let i = 0; i < node.childNodes.length; i++) {
        if (walkNodes(node.childNodes[i])) return true;
      }

      if (remaining <= prefix) {
         range.setStart(node, node.childNodes.length);
         range.collapse(true);
         return true;
      }
      remaining -= prefix;
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

// Optional range: when provided, only lines in [start, end] (inclusive) are emitted,
// but full content is used for getLineType context so list-items are still detected.
export interface MarkdownExportOptions {
  // wysiwyg: emit markdown that *renders* like the editor (nbsp indentation,
  // two-space hard line breaks, list-header names, image refs, blank-line-wrapped
  // blocks). Default (omitted/false) = legacy plain output, kept byte-for-byte.
  wysiwyg?: boolean;
  // Maps image ids (polaroid::<id>) to a relative path written by the storage layer.
  imagePaths?: Map<string, string>;
  // Maps voice ids (voice::<id>) to a relative path written by the storage layer.
  voicePaths?: Map<string, string>;
}

export function contentToMarkdown(
  content: string,
  range?: { start: number; end: number },
  opts?: MarkdownExportOptions,
): string {
  if (!content.trim()) return '';
  const lines = content.split('\n');

  if (!opts?.wysiwyg) {
    const rendered = lines.map((line, i) => {
      const type = getLineType(lines, i);
      if (type === 'divider') return '---';
      if (type === 'timer' || type === 'list-header' || type === 'image' || type === 'voice') return '';
      if (type === 'list-item') {
        const struck = isLineStruck(line);
        let clean = getCleanLine(line);
        let indent = 0;
        while (clean.startsWith(INDENT)) { indent++; clean = clean.slice(INDENT.length); }
        const pad = '  '.repeat(indent);
        return struck ? `${pad}- [x] ${clean}` : `${pad}- [ ] ${clean}`;
      }
      if (type === 'quote') return '> ' + line.replace(/^>> ?/, '');
      return line.startsWith(LIST_EXIT) ? line.slice(LIST_EXIT.length) : line;
    });

    const start = range ? Math.max(0, range.start) : 0;
    const end = range ? Math.min(lines.length - 1, range.end) : lines.length - 1;
    const slice = rendered.slice(start, end + 1);
    while (slice.length && slice[0] === '') slice.shift();
    while (slice.length && slice[slice.length - 1] === '') slice.pop();
    const out = slice.filter((line, i, arr) => !(line === '' && arr[i - 1] === ''))
      .join('\n');
    return range ? out : out + '\n';
  }

  // WYSIWYG mode — render-faithful markdown that mirrors the editor view.
  const imagePaths = opts.imagePaths;
  const voicePaths = opts.voicePaths;
  type Kind = 'text' | 'list' | 'heading' | 'quote' | 'divider' | 'image' | 'voice' | 'label' | 'empty';
  const rendered = lines.map((line, i): { text: string; kind: Kind } => {
    const type = getLineType(lines, i);
    if (type === 'divider') return { text: '---', kind: 'divider' };
    if (type === 'timer') return { text: '', kind: 'empty' };
    if (type === 'list-header') {
      const rawName = getCleanLine(line).trim();
      if (rawName.toLowerCase() === 'list') return { text: '', kind: 'empty' };
      return { text: `**${getListName(line)}**`, kind: 'label' };
    }
    if (type === 'image') {
      const m = line.match(/^polaroid::([^|]+)\|?([^|]*)?\|?(.*)?$/);
      const id = m?.[1] ?? '';
      const caption = m?.[2] ?? '';
      const path = imagePaths?.get(id);
      if (!path) return { text: '', kind: 'empty' };
      return { text: `![${caption}](${path})`, kind: 'image' };
    }
    if (type === 'voice') {
      const m = line.match(/^voice::([^|]+)\|?([^|]*)?\|?(.*)?$/);
      const id = m?.[1] ?? '';
      const label = m?.[2] ?? 'voice note';
      const duration = m?.[3] ?? '';
      const path = voicePaths?.get(id);
      if (path) return { text: `[${label} (${duration || '?'}s)](${path})`, kind: 'voice' };
      return { text: `🎙 ${label}${duration ? ` (${duration}s)` : ''}`, kind: 'voice' };
    }
    if (type === 'list-item') {
      const struck = isLineStruck(line);
      let clean = getCleanLine(line);
      let indent = 0;
      while (clean.startsWith(INDENT)) { indent++; clean = clean.slice(INDENT.length); }
      const pad = '  '.repeat(indent);
      return { text: struck ? `${pad}- [x] ${clean}` : `${pad}- [ ] ${clean}`, kind: 'list' };
    }
    if (type === 'quote') return { text: '> ' + line.replace(/^>> ?/, ''), kind: 'quote' };
    if (type === 'heading1' || type === 'heading2') {
      let h = getCleanLine(line);
      while (h.startsWith(INDENT)) { h = h.slice(INDENT.length); }
      return { text: h, kind: 'heading' };
    }
    let text = line.startsWith(LIST_EXIT) ? line.slice(LIST_EXIT.length) : line;
    let indent = 0;
    while (text.startsWith(INDENT)) { indent++; text = text.slice(INDENT.length); }
    if (text.length === 0) return { text: '', kind: 'empty' };
    return { text: NBSP.repeat(indent * NBSP_PER_INDENT) + text + '  ', kind: 'text' };
  });

  const start = range ? Math.max(0, range.start) : 0;
  const end = range ? Math.min(lines.length - 1, range.end) : lines.length - 1;
  const slice = rendered.slice(start, end + 1);
  while (slice.length && slice[0].kind === 'empty') slice.shift();
  while (slice.length && slice[slice.length - 1].kind === 'empty') slice.pop();

  // Insert a blank line between adjacent non-empty lines of differing kind so
  // block elements render, while same-kind runs (text, multi-line list/quote) stay tight.
  const outLines: string[] = [];
  for (let i = 0; i < slice.length; i++) {
    const cur = slice[i];
    const prev = i > 0 ? slice[i - 1] : null;
    if (cur.kind === 'empty') {
      if (outLines.length && outLines[outLines.length - 1] !== '') outLines.push('');
      continue;
    }
    if (prev && prev.kind !== 'empty' && prev.kind !== cur.kind && outLines.length && outLines[outLines.length - 1] !== '') {
      outLines.push('');
    }
    outLines.push(cur.text);
  }
  while (outLines.length && outLines[outLines.length - 1] === '') outLines.pop();
  const out = outLines.join('\n');
  return range ? out : out + '\n';
}

export function contentToScratchpadText(
  content: string,
  range?: { start: number; end: number },
): string {
  if (!content.trim()) return '';

  const lines = content.split('\n');
  const rendered = lines.map((line, i) => {
    const type = getLineType(lines, i);
    if (type === 'divider') return '---';
    if (type === 'timer') {
      const config = getTimerArgs(line);
      return config ? `timer ${config}` : 'timer';
    }
    if (type === 'list-header') {
      const rawName = getCleanLine(line).trim();
      return rawName.toLowerCase() === 'list' ? null : getListName(line);
    }
    if (type === 'image') return '';
    if (type === 'list-item') {
      const struck = isLineStruck(line);
      let clean = getCleanLine(line);
      let indent = 0;
      while (clean.startsWith(INDENT)) { indent++; clean = clean.slice(INDENT.length); }
      const pad = '  '.repeat(indent);
      return struck ? `${pad}- [x] ${clean}` : `${pad}- [ ] ${clean}`;
    }
    if (type === 'quote') return '> ' + line.replace(/^>> ?/, '');
    return line.startsWith(LIST_EXIT) ? line.slice(LIST_EXIT.length) : line;
  });

  const start = range ? Math.max(0, range.start) : 0;
  const end = range ? Math.min(lines.length - 1, range.end) : lines.length - 1;
  const slice = rendered.slice(start, end + 1).filter((line): line is string => line !== null);

  while (slice.length && slice[0] === '') slice.shift();
  while (slice.length && slice[slice.length - 1] === '') slice.pop();

  return slice
    .filter((line, index, arr) => !(line === '' && arr[index - 1] === ''))
    .join('\n');
}

export function scratchpadTextToContent(text: string): string {
  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/^timer::\s*/gim, 'timer ');

  return markdownToContent(normalized);
}

// Parse markdown back into ezWrite's internal line representation.
// Recognises checklist syntax (`- [ ]` / `- [x]` with optional 2-space indent nesting)
// and wraps contiguous checklist blocks with a `list` header so the editor re-hydrates
// them as interactive list-items with struck state preserved.
export function markdownToContent(md: string): string {
  const input = md.split('\n');
  const out: string[] = [];
  let inChecklist = false;

  const flushChecklistEnd = () => {
    if (inChecklist) inChecklist = false;
  };

  for (const rawLine of input) {
    // Reverse wysiwyg export: drop trailing hard-break spaces.
    const raw = rawLine.replace(/[ \t]+$/, '');
    const m = raw.match(/^(\s*)[-*+]\s+\[([ xX])\]\s?(.*)$/);
    if (m) {
      if (!inChecklist) {
        out.push('list');
        inChecklist = true;
      }
      const leading = m[1] ?? '';
      // 2 spaces or a tab per nesting level
      const indentUnits = leading.replace(/\t/g, '  ').length;
      const level = Math.floor(indentUnits / 2);
      const struck = m[2] !== ' ';
      const text = m[3] ?? '';
      out.push((struck ? STRUCK_MARKER : '') + INDENT.repeat(level) + text);
      continue;
    }
    flushChecklistEnd();
    if (/^\s*---\s*$/.test(raw)) { out.push('line'); continue; }
    if (/^>\s?/.test(raw)) { out.push('>> ' + raw.replace(/^>\s?/, '')); continue; }
    // Reverse wysiwyg export: leading non-breaking-space runs -> INDENT levels.
    if (raw.startsWith(NBSP)) {
      let rest = raw;
      let n = 0;
      while (rest.startsWith(NBSP)) { n++; rest = rest.slice(1); }
      const level = Math.floor(n / NBSP_PER_INDENT);
      out.push(INDENT.repeat(level) + rest);
      continue;
    }
    out.push(raw);
  }
  return out.join('\n');
}
