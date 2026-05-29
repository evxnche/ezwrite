// Persisted timer runtime state, so a running timer survives unmounts
// (page switches, scratchpad collapse, reloads). Keyed per timer instance.

export type SavedTimer = {
  baseSeconds: number;
  epoch: number;
  running: boolean;
  phase: 'work' | 'break';
  done: boolean;
};

const STORE_PREFIX = 'ezwrite-timer-rt-';

export function loadTimerState(key?: string): SavedTimer | null {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(STORE_PREFIX + key);
    return raw ? (JSON.parse(raw) as SavedTimer) : null;
  } catch {
    return null;
  }
}

export function saveTimerState(key: string | undefined, s: SavedTimer): void {
  if (!key) return;
  try {
    localStorage.setItem(STORE_PREFIX + key, JSON.stringify(s));
  } catch {
    /* ignore quota / serialization errors */
  }
}

export function clearTimerState(key?: string): void {
  if (!key) return;
  try {
    localStorage.removeItem(STORE_PREFIX + key);
  } catch {
    /* ignore */
  }
}

/**
 * Seconds to display when re-mounting a timer from persisted state. The timer is
 * wall-clock anchored, so a running timer accounts for the time spent unmounted.
 */
export function restoreDisplaySeconds(
  saved: SavedTimer,
  mode: 'pomodoro' | 'countdown' | 'stopwatch',
  now: number = Date.now(),
): number {
  if (saved.done) return mode === 'stopwatch' ? saved.baseSeconds : 0;
  const elapsed = saved.running ? Math.floor((now - saved.epoch) / 1000) : 0;
  if (mode === 'stopwatch') return saved.baseSeconds + elapsed;
  return Math.max(0, saved.baseSeconds - elapsed);
}
