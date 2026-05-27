import { getLineType, INDENT, LIST_EXIT, SLASH_COMMANDS, STRUCK_MARKER, isLineStruck, getListName, getCleanLine } from './writing-helpers.ts';

export type ShareCardTheme = '' | 'blue' | 'green' | 'red';

export interface DeletedPageSnapshot {
  index: number;
  content: string;
}

const LEADING_EDITOR_WHITESPACE = /^[ \u00a0]+/;
const PLAIN_NUMBERED_LIST_LINE = /^(\s*)(\d+)([./])\s(.*)$/;

function trimAccidentalLeadingWhitespace(text: string): string {
  return text.replace(LEADING_EDITOR_WHITESPACE, '');
}

export function normalizeEditorContent(content: string): string {
  return content
    .split('\n')
    .map((line) => {
      const struck = line.startsWith(STRUCK_MARKER);
      const base = struck ? line.slice(STRUCK_MARKER.length) : line;

      if (base.startsWith(LIST_EXIT)) {
        const visible = base.slice(LIST_EXIT.length);
        const normalized = visible.startsWith(INDENT) ? visible : trimAccidentalLeadingWhitespace(visible);
        return `${struck ? STRUCK_MARKER : ''}${LIST_EXIT}${normalized}`;
      }

      if (base.startsWith(INDENT)) {
        // Strip INDENT prefixes, then trim accidental whitespace from the visible portion
        let rest = base;
        let indentCount = 0;
        while (rest.startsWith(INDENT)) { indentCount++; rest = rest.slice(INDENT.length); }
        const cleanRest = trimAccidentalLeadingWhitespace(rest);
        if (cleanRest === rest) return line;
        return `${struck ? STRUCK_MARKER : ''}${INDENT.repeat(indentCount)}${cleanRest}`;
      }

      const normalized = trimAccidentalLeadingWhitespace(base);
      return `${struck ? STRUCK_MARKER : ''}${normalized}`;
    })
    .join('\n');
}

export function splitExitedListLine(line: string, offset: number): { current: string; next: string } {
  const visible = line.startsWith(LIST_EXIT) ? line.slice(LIST_EXIT.length) : line;
  const splitOffset = Math.max(0, Math.min(offset, visible.length));

  return {
    current: `${LIST_EXIT}${visible.slice(0, splitOffset)}`,
    next: visible.slice(splitOffset),
  };
}

export function renumberFollowingPlainNumberedListItems(lines: string[], insertedLineIndex: number): string[] {
  const inserted = lines[insertedLineIndex]?.match(PLAIN_NUMBERED_LIST_LINE);
  if (!inserted) return lines;

  const [, baseIndent, baseNumber, baseMarker] = inserted;
  const nextLines = [...lines];
  let nextNumber = Number.parseInt(baseNumber, 10) + 1;

  for (let i = insertedLineIndex + 1; i < nextLines.length; i++) {
    const match = nextLines[i].match(PLAIN_NUMBERED_LIST_LINE);
    if (!match || match[1] !== baseIndent || match[3] !== baseMarker) break;

    nextLines[i] = `${match[1]}${nextNumber}${match[3]} ${match[4]}`;
    nextNumber++;
  }

  return nextLines;
}

export function indentPlainListLineForTab(
  lines: string[],
  lineIndex: number,
  offset: number,
): { lines: string[]; offset: number } | null {
  const lineText = lines[lineIndex] || '';
  const listMatch = lineText.match(/^(\s*)([-*>]|\d+[./])\s/);
  if (!listMatch || offset > listMatch[0].length) return null;

  const numberedMatch = lineText.match(PLAIN_NUMBERED_LIST_LINE);
  if (!numberedMatch) {
    const nextLines = [...lines];
    nextLines[lineIndex] = INDENT + lineText;
    return { lines: nextLines, offset: offset + INDENT.length };
  }

  const [, baseIndent, baseNumber, baseMarker, text] = numberedMatch;
  const nextLines = [...lines];
  const nestedPrefix = `${baseIndent}${INDENT}1${baseMarker} `;
  nextLines[lineIndex] = `${nestedPrefix}${text}`;

  let nextNumber = Number.parseInt(baseNumber, 10);
  for (let i = lineIndex + 1; i < nextLines.length; i++) {
    const match = nextLines[i].match(PLAIN_NUMBERED_LIST_LINE);
    if (!match) break;

    const [, indent, , marker, itemText] = match;
    if (indent === baseIndent && marker === baseMarker) {
      nextLines[i] = `${indent}${nextNumber}${marker} ${itemText}`;
      nextNumber++;
      continue;
    }

    if (indent.startsWith(`${baseIndent}${INDENT}`)) continue;
    break;
  }

  return { lines: nextLines, offset: nestedPrefix.length };
}

export function deletePageFromList(
  pages: string[],
  pageIndex: number,
  currentPage: number,
): { pages: string[]; nextPage: number; deleted: DeletedPageSnapshot } | null {
  if (pages.length <= 1 || pageIndex < 0 || pageIndex >= pages.length) return null;

  const nextPages = [...pages];
  const [deletedContent] = nextPages.splice(pageIndex, 1);
  let nextPage: number;

  if (pageIndex < currentPage) {
    nextPage = currentPage - 1;
  } else if (pageIndex === currentPage) {
    nextPage = Math.min(currentPage, nextPages.length - 1);
  } else {
    nextPage = currentPage;
  }

  return {
    pages: nextPages,
    nextPage: Math.max(0, Math.min(nextPage, nextPages.length - 1)),
    deleted: {
      index: pageIndex,
      content: deletedContent ?? '',
    },
  };
}

export function restoreDeletedPageToList(
  pages: string[],
  deleted: DeletedPageSnapshot,
): { pages: string[]; restoredPage: number } {
  const restoredPage = Math.max(0, Math.min(deleted.index, pages.length));
  const nextPages = [...pages];
  nextPages.splice(restoredPage, 0, deleted.content);

  return {
    pages: nextPages,
    restoredPage,
  };
}

export function getPageEndCursor(content: string): { lineIndex: number; offset: number } {
  const lines = content.split('\n');
  const lineIndex = Math.max(0, lines.length - 1);
  return {
    lineIndex,
    offset: lines[lineIndex]?.length ?? 0,
  };
}

export function getFloatingSlashButtonCursor(content: string): {
  content: string;
  lineIndex: number;
  offset: number;
} {
  const lines = content.split('\n');

  if (lines.length === 0) {
    return { content: '', lineIndex: 0, offset: 0 };
  }

  if (lines[lines.length - 1] !== '') {
    lines.push('');
  }

  return {
    content: lines.join('\n'),
    lineIndex: Math.max(0, lines.length - 1),
    offset: 0,
  };
}

export function prepareFloatingSlashButtonCommand(content: string, currentLineIndex?: number | null): {
  content: string;
  lineIndex: number;
  offset: number;
  filter: string;
} {
  const lines = content.split('\n');

  if (
    currentLineIndex === null ||
    currentLineIndex === undefined ||
    currentLineIndex < 0 ||
    currentLineIndex >= lines.length
  ) {
    const fallback = getFloatingSlashButtonCursor(content);
    const nextLines = fallback.content.split('\n');
    nextLines[fallback.lineIndex] = '/';
    return {
      content: nextLines.join('\n'),
      lineIndex: fallback.lineIndex,
      offset: 1,
      filter: '',
    };
  }

  const visibleLine = lines[currentLineIndex].startsWith(LIST_EXIT)
    ? lines[currentLineIndex].slice(LIST_EXIT.length)
    : lines[currentLineIndex];
  const trimmed = visibleLine.trim();

  if (trimmed === '' || /^\/\w{0,10}$/.test(trimmed)) {
    const filter = trimmed.startsWith('/') ? trimmed.slice(1) : '';
    lines[currentLineIndex] = `/${filter}`;
    return {
      content: lines.join('\n'),
      lineIndex: currentLineIndex,
      offset: filter.length + 1,
      filter,
    };
  }

  lines.splice(currentLineIndex + 1, 0, '/');
  return {
    content: lines.join('\n'),
    lineIndex: currentLineIndex + 1,
    offset: 1,
    filter: '',
  };
}

export function normalizePastedPlainText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

const MARKDOWN_TASK_LINE = /^\s*[-*+]\s+\[[ xX]\]\s?/m;

export function normalizeClipboardPasteText(rawPlainText: string, htmlData: string): string {
  const plainText = normalizePastedPlainText(rawPlainText);
  if (MARKDOWN_TASK_LINE.test(plainText)) return plainText;
  return htmlData ? htmlToPlainLines(htmlData) : plainText;
}

export function getShareCardLines(content: string): string[] {
  const lines = content.split('\n');
  return lines
    .map((rawLine, index) => {
      const type = getLineType(lines, index);
      if (type === 'divider') return '';
      if (type === 'timer' || type === 'image') return null;
      if (type === 'list-header') {
        const rawName = getCleanLine(rawLine).trim();
        if (rawName.toLowerCase() === 'list') return null; // Drop unnamed
        return getListName(rawLine); // Returns the name part
      }

      let line = rawLine;
      const struck = isLineStruck(rawLine);
      if (line.startsWith(STRUCK_MARKER)) line = line.slice(STRUCK_MARKER.length);
      if (line.startsWith(LIST_EXIT)) line = line.slice(LIST_EXIT.length);
      while (line.startsWith(INDENT)) line = line.slice(INDENT.length);

      const trimmed = line.trim();
      if (!trimmed) return '';
      
      if (type === 'list-item') {
        return (struck ? '[x] ' : '[ ] ') + trimmed;
      }
      
      return trimmed.replace(/^#{1,2}\s+/, '');
    })
    .filter((line): line is string => line !== null);
}

export function getShareCardPalette(colorTheme: ShareCardTheme, darkMode: boolean): {
  background: string;
  paper: string;
  text: string;
  muted: string;
} {
  if (colorTheme === 'blue') {
    return darkMode
      ? { background: '#0623ad', paper: '#0623ad', text: '#EEF3FF', muted: 'rgba(238, 243, 255, 0.56)' }
      : { background: '#EAE7D0', paper: '#EAE7D0', text: '#0623ad', muted: 'rgba(6, 35, 173, 0.56)' };
  }

  if (colorTheme === 'green') {
    return darkMode
      ? { background: '#285135', paper: '#285135', text: '#EFF8EF', muted: 'rgba(239, 248, 239, 0.56)' }
      : { background: '#EAE7D0', paper: '#EAE7D0', text: '#285135', muted: 'rgba(40, 81, 53, 0.56)' };
  }

  if (colorTheme === 'red') {
    return darkMode
      ? { background: '#7C3232', paper: '#7C3232', text: '#FFF1EC', muted: 'rgba(255, 241, 236, 0.56)' }
      : { background: '#FFF4EE', paper: '#FFF4EE', text: '#351716', muted: 'rgba(53, 23, 22, 0.52)' };
  }

  return darkMode
    ? { background: '#171717', paper: '#171717', text: '#f4efe5', muted: 'rgba(244, 239, 229, 0.48)' }
    : { background: '#EAE7D0', paper: '#EAE7D0', text: '#231f1a', muted: 'rgba(35, 31, 26, 0.48)' };
}

export function htmlToPlainLines(html: string): string {
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<\/blockquote>/gi, '\n')
    .replace(/<\/tr>/gi, '\n');
  const stripped = withBreaks.replace(/<[^>]+>/g, '');
  const decoded = stripped
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
  return decoded
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function shouldAutoFocusAfterPageSwitch(isTouchDevice: boolean): boolean {
  return !isTouchDevice;
}

export function getClosestLineIndexForClick(
  clientY: number,
  lineRects: Array<{ top: number; bottom: number }>,
): number | null {
  if (lineRects.length === 0) return null;

  let closestIndex = 0;
  let closestDistance = Number.POSITIVE_INFINITY;

  lineRects.forEach((rect, index) => {
    if (clientY >= rect.top && clientY <= rect.bottom) {
      closestIndex = index;
      closestDistance = 0;
      return;
    }

    const centerY = (rect.top + rect.bottom) / 2;
    const distance = Math.abs(clientY - centerY);
    if (distance < closestDistance) {
      closestIndex = index;
      closestDistance = distance;
    }
  });

  return closestIndex;
}

export function getExactSlashCommand(line: string, slashCommands: readonly { name: string }[] = SLASH_COMMANDS): string | null {
  const visibleLine = line.startsWith(LIST_EXIT) ? line.slice(LIST_EXIT.length) : line;
  const trimmed = visibleLine.trim().toLowerCase();
  if (!trimmed.startsWith('/')) return null;

  const command = trimmed.slice(1);
  return slashCommands.some(item => item.name === command) ? command : null;
}

export interface SelectedLinePoint {
  lineIndex: number;
  offset: number;
}

export function getMarkdownRangeForSelection(
  startPoint: SelectedLinePoint,
  endPoint: SelectedLinePoint,
  lines: string[],
): { start: number; end: number } | null {
  const startsFirst = startPoint.lineIndex < endPoint.lineIndex ||
    (startPoint.lineIndex === endPoint.lineIndex && startPoint.offset <= endPoint.offset);
  const first = startsFirst ? startPoint : endPoint;
  const last = startsFirst ? endPoint : startPoint;
  const start = first.lineIndex;
  let end = last.lineIndex;

  // Browser selections that end at the start of the next line report that next
  // line as the range end. For line-based markdown export, that line was not
  // actually selected and must not be copied.
  if (last.offset === 0 && end > start) {
    end -= 1;
  }

  if (end < start) return null;

  const touchesStructuredLine = lines
    .slice(start, end + 1)
    .some((_, i) => {
      const type = getLineType(lines, start + i);
      return type !== 'text';
    });

  // Plain text should use the browser's native selection. It is more precise
  // than our line-based markdown conversion and avoids copying adjacent text.
  if (!touchesStructuredLine) return null;

  return { start, end };
}

export function getTouchGestureIntent({
  dx,
  dy,
  hasSelection,
  isKeyboardOpen,
  isEditorFocused,
}: {
  dx: number;
  dy: number;
  hasSelection: boolean;
  isKeyboardOpen: boolean;
  isEditorFocused: boolean;
}): 'dismiss-keyboard' | 'page-next' | 'page-prev' | null {
  if (hasSelection) return null;

  if (
    isKeyboardOpen &&
    isEditorFocused &&
    dy > 72 &&
    dy > Math.abs(dx) * 1.35
  ) {
    return 'dismiss-keyboard';
  }

  if (Math.abs(dx) > Math.abs(dy) * 1.2 && Math.abs(dx) > 84) {
    return dx < 0 ? 'page-next' : 'page-prev';
  }

  return null;
}
