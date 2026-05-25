export const BUG_REPORT_EMAIL = 'evanbuildsstuff@gmail.com';
export const BUG_REPORTS_TABLE = 'ezwrite_bug_reports';

type BugReportEnv = {
  VITE_SUPABASE_ANON_KEY?: string;
  VITE_SUPABASE_URL?: string;
};

let bugReportEnvOverride: BugReportEnv | null = null;

export type BugReportSource = 'help' | 'settings';
export type BugReportConfigStatus = 'ready' | 'missing-env';

export function setBugReportEnvForTests(env: BugReportEnv | null): void {
  bugReportEnvOverride = env;
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

export function getBugReportContext(extra?: Record<string, string>): Record<string, string> {
  if (typeof window === 'undefined') return { ...extra };

  return {
    page: window.location.href,
    time: new Date().toISOString(),
    colorTheme: localStorage.getItem('ezwrite-color-theme') ?? '(first visit default)',
    mode: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
    userAgent: navigator.userAgent,
    ...extra,
  };
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

export function openBugReportMailto(extra?: Record<string, string>): void {
  window.location.href = buildBugReportMailto(extra);
}

export interface SubmitBugReportInput {
  message: string;
  source: BugReportSource;
  contactEmail?: string;
  accessToken?: string;
  userId?: string;
  extra?: Record<string, string>;
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
