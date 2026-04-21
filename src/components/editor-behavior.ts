import { INDENT, LIST_EXIT, STRUCK_MARKER } from './writing-helpers.ts';

export type ShareCardTheme = '' | 'blue' | 'green' | 'red';

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

export function getShareCardLines(content: string): string[] {
  return content
    .split('\n')
    .map((rawLine) => {
      let line = rawLine;
      if (line.startsWith(STRUCK_MARKER)) line = line.slice(STRUCK_MARKER.length);
      if (line.startsWith(LIST_EXIT)) line = line.slice(LIST_EXIT.length);
      while (line.startsWith(INDENT)) line = line.slice(INDENT.length);

      const trimmed = line.trim();
      if (!trimmed) return '';
      if (trimmed === 'list') return null;
      if (trimmed === 'line') return '';
      if (/^timer(\s|$)/i.test(trimmed)) return null;
      if (trimmed.startsWith('img::')) return null;
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
      ? { background: '#25334B', paper: '#1B2638', text: '#EEF3FF', muted: 'rgba(238, 243, 255, 0.50)' }
      : { background: '#4E6A9B', paper: '#EEF3FF', text: '#1F2D46', muted: 'rgba(31, 45, 70, 0.52)' };
  }

  if (colorTheme === 'green') {
    return darkMode
      ? { background: '#285135', paper: '#193221', text: '#EFF8EF', muted: 'rgba(239, 248, 239, 0.50)' }
      : { background: '#DDEBDD', paper: '#FBFFF8', text: '#193221', muted: 'rgba(25, 50, 33, 0.52)' };
  }

  if (colorTheme === 'red') {
    return darkMode
      ? { background: '#7C3232', paper: '#2D1717', text: '#FFF1EC', muted: 'rgba(255, 241, 236, 0.50)' }
      : { background: '#7C3232', paper: '#FFF4EE', text: '#351716', muted: 'rgba(53, 23, 22, 0.52)' };
  }

  return darkMode
    ? { background: '#171717', paper: '#20201e', text: '#f4efe5', muted: 'rgba(244, 239, 229, 0.48)' }
    : { background: '#f5f1e8', paper: '#fffaf0', text: '#231f1a', muted: 'rgba(35, 31, 26, 0.48)' };
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
