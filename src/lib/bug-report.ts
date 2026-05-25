export const BUG_REPORT_EMAIL = 'evanbuildsstuff@gmail.com';
export const BUG_REPORTS_TABLE = 'ezwrite_bug_reports';

type BugReportEnv = {
  VITE_SUPABASE_ANON_KEY?: string;
  VITE_SUPABASE_URL?: string;
};

export type BugReportContextValue = string | number | boolean;
export type BugReportContext = Record<string, BugReportContextValue>;

let bugReportEnvOverride: BugReportEnv | null = null;
let bugReportRuntimeContext: BugReportContext = {};
let recentBugReportErrors: string[] = [];
let recentBugReportConsoleErrors: string[] = [];
let recentBugReportActions: string[] = [];
let bugReportDiagnosticsInstalled = false;
let originalConsoleError: typeof console.error | null = null;

const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
const APP_COMMIT_SHA = typeof __APP_COMMIT_SHA__ !== 'undefined' ? __APP_COMMIT_SHA__ : 'unknown';
const MAX_BUG_REPORT_ERRORS = 6;
const MAX_BUG_REPORT_ACTIONS = 12;

export type BugReportSource = 'help' | 'settings';
export type BugReportConfigStatus = 'ready' | 'missing-env';

export function setBugReportEnvForTests(env: BugReportEnv | null): void {
  bugReportEnvOverride = env;
}

export function resetBugReportStateForTests(): void {
  bugReportEnvOverride = null;
  bugReportRuntimeContext = {};
  recentBugReportErrors = [];
  recentBugReportConsoleErrors = [];
  recentBugReportActions = [];
  bugReportDiagnosticsInstalled = false;
  if (originalConsoleError) {
    console.error = originalConsoleError;
    originalConsoleError = null;
  }
}

function getBugReportEnv(): BugReportEnv {
  if (bugReportEnvOverride) return bugReportEnvOverride;
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return {
      VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL as string | undefined,
      VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
    };
  }
  return {};
}

export function getBugReportConfigStatus(): BugReportConfigStatus {
  const env = getBugReportEnv();
  return env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY ? 'ready' : 'missing-env';
}

function normalizeBugReportContext(input?: Record<string, unknown>): BugReportContext {
  const entries: Array<[string, BugReportContextValue]> = [];
  for (const [key, value] of Object.entries(input ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      entries.push([key, value]);
      continue;
    }
    if (Array.isArray(value)) {
      entries.push([key, value.map((item) => String(item)).join(' | ')]);
      continue;
    }
    entries.push([key, JSON.stringify(value)]);
  }
  return Object.fromEntries(entries);
}

export function setBugReportRuntimeContext(context: Record<string, unknown>): void {
  bugReportRuntimeContext = normalizeBugReportContext(context);
}

function recordRecentBugReportError(message: string): void {
  if (!message.trim()) return;
  recentBugReportErrors = [message.trim(), ...recentBugReportErrors].slice(0, MAX_BUG_REPORT_ERRORS);
}

function recordRecentBugReportConsoleError(message: string): void {
  if (!message.trim()) return;
  recentBugReportConsoleErrors = [message.trim(), ...recentBugReportConsoleErrors].slice(0, MAX_BUG_REPORT_ERRORS);
}

function stringifyBugReportConsoleArg(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatBugReportBreadcrumb(label: string, data?: Record<string, unknown>): string {
  const normalized = normalizeBugReportContext(data);
  const details = Object.entries(normalized)
    .map(([key, value]) => `${key}=${value}`)
    .join(', ');
  return details ? `${label} (${details})` : label;
}

export function recordBugReportBreadcrumb(label: string, data?: Record<string, unknown>): void {
  const entry = formatBugReportBreadcrumb(label, data).trim();
  if (!entry) return;
  recentBugReportActions = [entry, ...recentBugReportActions].slice(0, MAX_BUG_REPORT_ACTIONS);
}

function formatBugReportErrorMessage(prefix: string, details: string): string {
  return `${prefix}: ${details}`.slice(0, 1200);
}

export function installBugReportDiagnostics(): void {
  if (bugReportDiagnosticsInstalled || typeof window === 'undefined') return;
  bugReportDiagnosticsInstalled = true;

  window.addEventListener('error', (event) => {
    const errorEvent = event as ErrorEvent;
    const location = errorEvent.filename
      ? ` @ ${errorEvent.filename}:${errorEvent.lineno ?? 0}:${errorEvent.colno ?? 0}`
      : '';
    const details = errorEvent.error instanceof Error
      ? `${errorEvent.error.name}: ${errorEvent.error.message}${location}`
      : `${errorEvent.message || 'Unknown error'}${location}`;
    recordRecentBugReportError(formatBugReportErrorMessage('uncaught', details));
  });

  window.addEventListener('unhandledrejection', (event) => {
    const rejectionEvent = event as PromiseRejectionEvent;
    const reason = rejectionEvent.reason instanceof Error
      ? `${rejectionEvent.reason.name}: ${rejectionEvent.reason.message}`
      : String(rejectionEvent.reason ?? 'Unknown rejection');
    recordRecentBugReportError(formatBugReportErrorMessage('unhandled rejection', reason));
  });

  if (!originalConsoleError) {
    originalConsoleError = console.error.bind(console);
    console.error = (...args: Parameters<typeof console.error>) => {
      const message = args.map(stringifyBugReportConsoleArg).join(' ');
      recordRecentBugReportConsoleError(message.slice(0, 1200));
      originalConsoleError?.(...args);
    };
  }
}

function getDisplayMode(): string {
  if (typeof window === 'undefined') return 'server';
  if (window.matchMedia?.('(display-mode: standalone)').matches) return 'standalone';
  if ((navigator as Navigator & { standalone?: boolean }).standalone) return 'ios-standalone';
  return 'browser-tab';
}

export function getBugReportContext(extra?: Record<string, unknown>): BugReportContext {
  if (typeof window === 'undefined') return normalizeBugReportContext(extra);

  const context: BugReportContext = {
    appVersion: APP_VERSION,
    buildCommit: APP_COMMIT_SHA,
    buildMode: typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.MODE : 'unknown',
    page: window.location.href,
    time: new Date().toISOString(),
    colorTheme: localStorage.getItem('ezwrite-color-theme') ?? '(first visit default)',
    mode: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
    displayMode: getDisplayMode(),
    viewport: `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio || 1}`,
    screen: `${window.screen?.width ?? 0}x${window.screen?.height ?? 0}`,
    language: navigator.language || 'unknown',
    online: navigator.onLine,
    userAgent: navigator.userAgent,
    ...bugReportRuntimeContext,
    ...normalizeBugReportContext(extra),
  };

  if (recentBugReportErrors.length) {
    context.recentErrors = recentBugReportErrors.join('\n');
  }
  if (recentBugReportConsoleErrors.length) {
    context.recentConsoleErrors = recentBugReportConsoleErrors.join('\n');
  }
  if (recentBugReportActions.length) {
    context.recentActions = recentBugReportActions.join('\n');
  }

  return context;
}

export function validateBugReportMessage(message: string): string | null {
  const trimmed = message.trim();
  if (trimmed.length < 10) return 'please add a bit more detail (10+ characters)';
  if (trimmed.length > 4000) return 'please keep it under 4000 characters';
  return null;
}

function getRestUrl(table: string): string {
  const { VITE_SUPABASE_URL } = getBugReportEnv();
  if (!VITE_SUPABASE_URL) throw new Error('Missing VITE_SUPABASE_URL');
  return `${VITE_SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${table}`;
}

function getHeaders(accessToken?: string): HeadersInit {
  const { VITE_SUPABASE_ANON_KEY } = getBugReportEnv();
  if (!VITE_SUPABASE_ANON_KEY) throw new Error('Missing VITE_SUPABASE_ANON_KEY');
  return {
    apikey: VITE_SUPABASE_ANON_KEY,
    Authorization: `Bearer ${accessToken ?? VITE_SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  };
}

function shouldFallbackToEmail(status: number, body: string): boolean {
  const normalized = body.toLowerCase();
  if (
    normalized.includes("could not find the table 'public.ezwrite_bug_reports'") ||
    normalized.includes('schema cache')
  ) {
    return true;
  }

  if (status !== 403 && status !== 404) return false;

  try {
    const parsed = JSON.parse(body) as { code?: string; message?: string };
    return parsed.code === 'PGRST205' || parsed.code === '42501';
  } catch {
    return false;
  }
}

export function buildBugReportMailto(extra?: Record<string, unknown>): string {
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

export function openBugReportMailto(extra?: Record<string, unknown>): void {
  window.location.href = buildBugReportMailto(extra);
}

export interface SubmitBugReportInput {
  message: string;
  source: BugReportSource;
  contactEmail?: string;
  accessToken?: string;
  userId?: string;
  extra?: Record<string, unknown>;
}

export async function submitBugReport(input: SubmitBugReportInput): Promise<'database' | 'email'> {
  const validationError = validateBugReportMessage(input.message);
  if (validationError) throw new Error(validationError);

  const message = input.message.trim();
  const contactEmail = input.contactEmail?.trim().toLowerCase() || null;

  if (getBugReportConfigStatus() !== 'ready') {
    openBugReportMailto({
      ...input.extra,
      report: message,
      contact: contactEmail || '(not provided)',
    });
    return 'email';
  }

  const row = {
    message,
    contact_email: contactEmail,
    user_id: input.userId ?? null,
    source: input.source,
    debug_context: getBugReportContext(input.extra),
  };

  const res = await fetch(getRestUrl(BUG_REPORTS_TABLE), {
    method: 'POST',
    headers: getHeaders(input.accessToken),
    body: JSON.stringify(row),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (shouldFallbackToEmail(res.status, body)) {
      openBugReportMailto({
        ...input.extra,
        report: message,
        contact: contactEmail || '(not provided)',
      });
      return 'email';
    }
    throw new Error(`Could not send report (${res.status}). ${body || res.statusText}`);
  }

  return 'database';
}
