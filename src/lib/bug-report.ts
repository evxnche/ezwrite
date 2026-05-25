export const BUG_REPORT_EMAIL = 'evanbuildsstuff@gmail.com';

export function getBugReportContext(extra?: Record<string, string>): Record<string, string> {
  if (typeof window === 'undefined') return { ...extra };

  return {
    page: window.location.href,
    time: new Date().toISOString(),
    colorTheme: localStorage.getItem('ezwrite-color-theme') ?? '(first visit default)',
    mode: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
    ...extra,
  };
}

export function buildBugReportMailto(extra?: Record<string, string>): string {
  const context = getBugReportContext(extra);
  const body = [
    'What happened:',
    '',
    '',
    'Steps to reproduce:',
    '1.',
    '',
    '---',
    'ezwrite debug info',
    ...Object.entries(context).map(([key, value]) => `${key}: ${value}`),
  ].join('\n');

  const params = new URLSearchParams({
    subject: 'ezwrite bug report',
    body,
  });

  return `mailto:${BUG_REPORT_EMAIL}?${params.toString()}`;
}

export function openBugReport(extra?: Record<string, string>): void {
  window.location.href = buildBugReportMailto(extra);
}
