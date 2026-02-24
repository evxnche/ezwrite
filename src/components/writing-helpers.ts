export const STRUCK_MARKER = '\u200B\u2713';
export const INDENT = '  ';

export const getCleanLine = (line: string) => line.startsWith(STRUCK_MARKER) ? line.slice(STRUCK_MARKER.length) : line;
export const isLineStruck = (line: string) => line.startsWith(STRUCK_MARKER);

export type LineType = 'text' | 'list-header' | 'list-item' | 'divider' | 'timer';

export const SLASH_COMMANDS = [
  { name: 'list', description: 'Create a checklist' },
  { name: 'line', description: 'Insert a divider' },
  { name: 'timer', description: 'Start a timer' },
];

export function getLineType(lines: string[], index: number): LineType {
  const clean = getCleanLine(lines[index]).trim().toLowerCase();
  if (clean === 'list') return 'list-header';
  if (clean === 'line') return 'divider';
  if (/^timer(\s|$)/i.test(clean)) return 'timer';

  let emptyCount = 0;
  for (let i = index - 1; i >= 0; i--) {
    const c = getCleanLine(lines[i]).trim().toLowerCase();
    if (c === 'list') return 'list-item';
    if (c === 'line' || /^timer(\s|$)/i.test(c)) return 'text';
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

export function autoResize(el: HTMLTextAreaElement) {
  el.style.height = '0';
  el.style.height = `${el.scrollHeight}px`;
}
