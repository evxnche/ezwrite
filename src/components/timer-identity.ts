import { getLineType, getTimerArgs } from './writing-helpers.ts';

export interface TimerSlotDescriptor {
  config: string;
  lineIndex: number;
  stableId: string;
}

export function buildTimerSlots(
  lines: string[],
  editingTimerLine?: number | null,
): TimerSlotDescriptor[] {
  const counts = new Map<string, number>();

  return lines.flatMap((line, lineIndex) => {
    if (getLineType(lines, lineIndex) !== 'timer' || editingTimerLine === lineIndex) {
      return [];
    }

    const config = getTimerArgs(line);
    const baseKey = config || '__stopwatch__';
    const occurrence = (counts.get(baseKey) ?? 0) + 1;
    counts.set(baseKey, occurrence);

    return [{
      config,
      lineIndex,
      stableId: `${baseKey}::${occurrence}`,
    }];
  });
}

export function getRemovedTimerStableIds(previousLines: string[], nextLines: string[]): string[] {
  const nextIds = new Set(buildTimerSlots(nextLines).map(({ stableId }) => stableId));
  return buildTimerSlots(previousLines)
    .map(({ stableId }) => stableId)
    .filter((stableId) => !nextIds.has(stableId));
}

export function getAddedTimerStableIds(previousLines: string[], nextLines: string[]): string[] {
  const previousIds = new Set(buildTimerSlots(previousLines).map(({ stableId }) => stableId));
  return buildTimerSlots(nextLines)
    .map(({ stableId }) => stableId)
    .filter((stableId) => !previousIds.has(stableId));
}
