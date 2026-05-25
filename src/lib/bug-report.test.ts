import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BUG_REPORT_EMAIL,
  buildBugReportMailto,
  getBugReportContext,
  installBugReportDiagnostics,
  recordBugReportBreadcrumb,
  resetBugReportStateForTests,
  setBugReportRuntimeContext,
  setBugReportEnvForTests,
  submitBugReport,
  validateBugReportMessage,
} from './bug-report.ts';

test.afterEach(() => {
  resetBugReportStateForTests();
  delete (globalThis as typeof globalThis & { fetch?: typeof fetch }).fetch;
  delete (globalThis as typeof globalThis & { window?: Window }).window;
  delete (globalThis as typeof globalThis & { localStorage?: Storage }).localStorage;
  delete (globalThis as typeof globalThis & { document?: Document }).document;
  delete (globalThis as typeof globalThis & { navigator?: Navigator }).navigator;
});

test('validateBugReportMessage enforces length bounds', () => {
  assert.equal(validateBugReportMessage('short'), 'please add a bit more detail (10+ characters)');
  assert.equal(validateBugReportMessage('a'.repeat(4001)), 'please keep it under 4000 characters');
  assert.equal(validateBugReportMessage('  enough detail here  '), null);
});

test('buildBugReportMailto targets the support inbox with a prefilled template', () => {
  const mailto = buildBugReportMailto({ project: 'welcome' });

  assert.ok(mailto.startsWith(`mailto:${BUG_REPORT_EMAIL}?`));
  assert.match(mailto, /subject=ezwrite\+bug\+report/);
  assert.match(mailto, /What\+happened/);
  assert.match(mailto, /project%3A\+welcome/);
});

test('getBugReportContext includes browser metadata and caller-provided context', () => {
  globalThis.window = {
    innerWidth: 390,
    innerHeight: 844,
    devicePixelRatio: 3,
    location: { href: 'https://ezwrite.xyz' },
    matchMedia: () => ({ matches: true }),
    screen: { width: 1170, height: 2532 },
  } as Window;
  globalThis.localStorage = { getItem: () => 'red' } as Storage;
  globalThis.document = {
    documentElement: { classList: { contains: (name: string) => name === 'dark' } },
  } as Document;
  globalThis.navigator = { userAgent: 'node-test-agent', language: 'en-GB', onLine: true } as Navigator;
  setBugReportRuntimeContext({ currentPage: 2, pageCount: 4, syncUnlocked: true, syncPlan: 'paid' });

  const context = getBugReportContext({ sourcePanel: 'settings' });

  assert.equal(context.appVersion, 'dev');
  assert.equal(context.buildCommit, 'unknown');
  assert.equal(context.page, 'https://ezwrite.xyz');
  assert.equal(context.colorTheme, 'red');
  assert.equal(context.mode, 'dark');
  assert.equal(context.displayMode, 'standalone');
  assert.equal(context.viewport, '390x844@3');
  assert.equal(context.screen, '1170x2532');
  assert.equal(context.language, 'en-GB');
  assert.equal(context.online, true);
  assert.equal(context.userAgent, 'node-test-agent');
  assert.equal(context.currentPage, 2);
  assert.equal(context.pageCount, 4);
  assert.equal(context.syncUnlocked, true);
  assert.equal(context.syncPlan, 'paid');
  assert.equal(context.sourcePanel, 'settings');
  assert.match(context.time, /^\d{4}-\d{2}-\d{2}T/);
});

test('installBugReportDiagnostics captures uncaught errors and rejections', () => {
  const handlers: Record<string, (event: unknown) => void> = {};
  globalThis.window = {
    innerWidth: 390,
    innerHeight: 844,
    devicePixelRatio: 3,
    location: { href: 'https://ezwrite.xyz' },
    matchMedia: () => ({ matches: false }),
    screen: { width: 1170, height: 2532 },
    addEventListener: (name: string, handler: (event: unknown) => void) => {
      handlers[name] = handler;
    },
  } as unknown as Window;
  globalThis.localStorage = { getItem: () => null } as Storage;
  globalThis.document = {
    documentElement: { classList: { contains: () => false } },
  } as Document;
  globalThis.navigator = { userAgent: 'node-test-agent', language: 'en-US', onLine: false } as Navigator;

  installBugReportDiagnostics();
  handlers.error?.({
    message: 'toolbar crashed',
    filename: 'https://ezwrite.xyz/assets/app.js',
    lineno: 12,
    colno: 4,
    error: new Error('toolbar crashed'),
  });
  handlers.unhandledrejection?.({ reason: new Error('sync exploded') });

  const context = getBugReportContext();
  assert.match(String(context.recentErrors), /uncaught: Error: toolbar crashed/);
  assert.match(String(context.recentErrors), /unhandled rejection: Error: sync exploded/);
});

test('installBugReportDiagnostics captures recent console errors', () => {
  const handlers: Record<string, (event: unknown) => void> = {};
  globalThis.window = {
    innerWidth: 390,
    innerHeight: 844,
    devicePixelRatio: 3,
    location: { href: 'https://ezwrite.xyz' },
    matchMedia: () => ({ matches: false }),
    screen: { width: 1170, height: 2532 },
    addEventListener: (name: string, handler: (event: unknown) => void) => {
      handlers[name] = handler;
    },
  } as unknown as Window;
  globalThis.localStorage = { getItem: () => null } as Storage;
  globalThis.document = {
    documentElement: { classList: { contains: () => false } },
  } as Document;
  globalThis.navigator = { userAgent: 'node-test-agent', language: 'en-US', onLine: true } as Navigator;

  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    void args;
  };

  try {
    installBugReportDiagnostics();
    console.error('sync failed', { code: '500' });
    const context = getBugReportContext();
    assert.match(String(context.recentConsoleErrors), /sync failed/);
    assert.match(String(context.recentConsoleErrors), /500/);
  } finally {
    console.error = originalConsoleError;
  }
});

test('recordBugReportBreadcrumb keeps a short recent action trail', () => {
  globalThis.window = {
    innerWidth: 390,
    innerHeight: 844,
    devicePixelRatio: 3,
    location: { href: 'https://ezwrite.xyz' },
    matchMedia: () => ({ matches: false }),
    screen: { width: 1170, height: 2532 },
  } as Window;
  globalThis.localStorage = { getItem: () => null } as Storage;
  globalThis.document = {
    documentElement: { classList: { contains: () => false } },
  } as Document;
  globalThis.navigator = { userAgent: 'node-test-agent', language: 'en-US', onLine: true } as Navigator;

  recordBugReportBreadcrumb('opened settings');
  recordBugReportBreadcrumb('changed page', { currentPage: 2, pageCount: 5 });

  const context = getBugReportContext();
  assert.match(String(context.recentActions), /opened settings/);
  assert.match(String(context.recentActions), /changed page/);
  assert.match(String(context.recentActions), /currentPage=2/);
  assert.match(String(context.recentActions), /pageCount=5/);
});

test('submitBugReport posts to Supabase REST when env is configured', async () => {
  setBugReportEnvForTests({
    VITE_SUPABASE_URL: 'https://example.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'anon-key',
  });

  let request: { url?: string; init?: RequestInit } = {};
  globalThis.fetch = async (url, init) => {
    request = { url: String(url), init };
    return new Response('', { status: 201 });
  };

  const method = await submitBugReport({
    message: 'the cursor jumps after pressing enter twice',
    source: 'settings',
    contactEmail: 'Person@Example.Com ',
    accessToken: 'session-token',
    userId: 'user-123',
    extra: { project: 'welcome' },
  });

  assert.equal(method, 'database');
  assert.equal(request.url, 'https://example.supabase.co/rest/v1/ezwrite_bug_reports');
  assert.equal((request.init?.method ?? '').toUpperCase(), 'POST');

  const headers = request.init?.headers as Record<string, string>;
  assert.equal(headers.apikey, 'anon-key');
  assert.equal(headers.Authorization, 'Bearer session-token');
  assert.equal(headers.Prefer, 'return=minimal');

  const row = JSON.parse(String(request.init?.body));
  assert.equal(row.message, 'the cursor jumps after pressing enter twice');
  assert.equal(row.contact_email, 'person@example.com');
  assert.equal(row.user_id, 'user-123');
  assert.equal(row.source, 'settings');
  assert.equal(row.debug_context.project, 'welcome');
});

test('submitBugReport falls back to email when Supabase bug-report table is missing', async () => {
  setBugReportEnvForTests({
    VITE_SUPABASE_URL: 'https://example.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'anon-key',
  });

  globalThis.fetch = async () => new Response(
    JSON.stringify({
      code: 'PGRST205',
      message: "Could not find the table 'public.ezwrite_bug_reports' in the schema cache",
    }),
    {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    },
  );

  globalThis.window = { location: { href: '' } } as Window;
  globalThis.localStorage = { getItem: () => null } as Storage;
  globalThis.document = {
    documentElement: { classList: { contains: () => false } },
  } as Document;
  globalThis.navigator = { userAgent: 'node-test' } as Navigator;

  const method = await submitBugReport({
    message: 'exporting pdf crashes when the note has an image',
    source: 'help',
    contactEmail: 'bugs@example.com',
  });

  assert.equal(method, 'email');
  assert.match(globalThis.window.location.href, /^mailto:/);
  assert.match(globalThis.window.location.href, /bugs%40example.com/);
});
