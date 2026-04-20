import { INDENT, LIST_EXIT, STRUCK_MARKER } from './writing-helpers.ts';

const LEADING_EDITOR_WHITESPACE = /^[ \u00a0]+/;

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

export function normalizePastedPlainText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
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
