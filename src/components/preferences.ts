export const COLOR_THEMES = ['', 'blue', 'green', 'red'] as const;
export type ColorTheme = (typeof COLOR_THEMES)[number];

export const TIMER_ALERT_MODES = ['both', 'visual', 'audio', 'silent'] as const;
export type TimerAlertMode = (typeof TIMER_ALERT_MODES)[number];

export function pickColorTheme(theme: string): ColorTheme {
  return (COLOR_THEMES as readonly string[]).includes(theme) ? (theme as ColorTheme) : '';
}

export function getNextColorTheme(currentTheme: string): ColorTheme {
  const current = pickColorTheme(currentTheme);
  const nextIndex = (COLOR_THEMES.indexOf(current) + 1) % COLOR_THEMES.length;
  return COLOR_THEMES[nextIndex];
}

export function pickTimerAlertMode(mode: string): TimerAlertMode {
  return (TIMER_ALERT_MODES as readonly string[]).includes(mode) ? (mode as TimerAlertMode) : 'both';
}

export function getNextTimerAlertMode(currentMode: string): TimerAlertMode {
  const current = pickTimerAlertMode(currentMode);
  const nextIndex = (TIMER_ALERT_MODES.indexOf(current) + 1) % TIMER_ALERT_MODES.length;
  return TIMER_ALERT_MODES[nextIndex];
}
