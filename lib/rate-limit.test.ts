import test from 'node:test';
import assert from 'node:assert/strict';

import { rateLimitAllow, clientIp, type RateLimitEnv } from './rate-limit.ts';

const env: RateLimitEnv = { supabaseUrl: 'https://example.supabase.co', serviceRoleKey: 'svc' };

test.afterEach(() => { delete (globalThis as { fetch?: typeof fetch }).fetch; });

test('allows when the RPC returns true', async () => {
  globalThis.fetch = async () => new Response('true', { status: 200 });
  assert.equal(await rateLimitAllow(env, 'k', 60, 10), true);
});

test('blocks when the RPC returns false', async () => {
  globalThis.fetch = async () => new Response('false', { status: 200 });
  assert.equal(await rateLimitAllow(env, 'k', 60, 10), false);
});

test('fails OPEN when the RPC errors (e.g. migration not applied)', async () => {
  globalThis.fetch = async () => new Response('{"message":"function does not exist"}', { status: 404 });
  assert.equal(await rateLimitAllow(env, 'k', 60, 10), true);
});

test('fails OPEN on a network throw', async () => {
  globalThis.fetch = async () => { throw new Error('down'); };
  assert.equal(await rateLimitAllow(env, 'k', 60, 10), true);
});

test('does not block (or call fetch) when unconfigured', async () => {
  let called = false;
  globalThis.fetch = async () => { called = true; return new Response('false', { status: 200 }); };
  assert.equal(await rateLimitAllow({ supabaseUrl: '', serviceRoleKey: '' }, 'k', 60, 10), true);
  assert.equal(called, false);
});

test('clientIp prefers x-real-ip, falls back to the first x-forwarded-for hop', () => {
  assert.equal(clientIp((n) => (n === 'x-real-ip' ? '9.9.9.9' : '1.1.1.1, 2.2.2.2')), '9.9.9.9');
  assert.equal(clientIp((n) => (n === 'x-forwarded-for' ? '1.1.1.1, 2.2.2.2' : undefined)), '1.1.1.1');
  assert.equal(clientIp(() => undefined), 'unknown');
});
