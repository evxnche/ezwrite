import test from 'node:test';
import assert from 'node:assert/strict';

import { validateOpencodeProxyBody } from './opencode-upstream.ts';

test('keyless calls are allowed for -free zen models', () => {
  const v = validateOpencodeProxyBody(JSON.stringify({ model: 'deepseek-v4-flash-free', messages: [] }), false);
  assert.equal(v.ok, true);
  assert.ok(v.body);
});

test('keyless calls to paid models are rejected — no anonymous relay', () => {
  const v = validateOpencodeProxyBody(JSON.stringify({ model: 'deepseek-v4-flash', messages: [] }), false);
  assert.equal(v.ok, false);
  assert.equal(v.status, 403);
});

test('any model is allowed when the caller brings their own key', () => {
  const v = validateOpencodeProxyBody(JSON.stringify({ model: 'deepseek-v4-flash', messages: [] }), true);
  assert.equal(v.ok, true);
});

test('gateway defaults to zen and is stripped from the forwarded body', () => {
  const v = validateOpencodeProxyBody(JSON.stringify({ model: 'glm-5', gateway: 'zen' }), true);
  assert.equal(v.ok, true);
  assert.equal(v.gateway, 'zen');
  assert.equal('gateway' in (JSON.parse(v.body!) as object), false);
});

test('the go gateway is selectable with a key', () => {
  const v = validateOpencodeProxyBody(JSON.stringify({ model: 'mimo-v2.5', gateway: 'go' }), true);
  assert.equal(v.ok, true);
  assert.equal(v.gateway, 'go');
});

test('keyless calls cannot use the go gateway — it has no free models', () => {
  const v = validateOpencodeProxyBody(JSON.stringify({ model: 'deepseek-v4-flash-free', gateway: 'go' }), false);
  assert.equal(v.ok, false);
  assert.equal(v.status, 403);
});

test('an unknown gateway value is rejected', () => {
  const v = validateOpencodeProxyBody(JSON.stringify({ model: 'glm-5', gateway: 'other' }), true);
  assert.equal(v.ok, false);
  assert.equal(v.status, 400);
});

test('missing model is rejected', () => {
  const v = validateOpencodeProxyBody(JSON.stringify({ messages: [] }), true);
  assert.equal(v.ok, false);
  assert.equal(v.status, 400);
});

test('invalid JSON is rejected', () => {
  const v = validateOpencodeProxyBody('not-json', true);
  assert.equal(v.ok, false);
  assert.equal(v.status, 400);
});

test('oversized bodies are rejected', () => {
  const v = validateOpencodeProxyBody('x'.repeat(300_000), true);
  assert.equal(v.ok, false);
  assert.equal(v.status, 413);
});

test('max_tokens is clamped', () => {
  const v = validateOpencodeProxyBody(JSON.stringify({ model: 'glm-5', max_tokens: 999_999 }), true);
  assert.equal(v.ok, true);
  const body = JSON.parse(v.body!) as { max_tokens: number };
  assert.equal(body.max_tokens, 4096);
});

test('a sane max_tokens passes through untouched', () => {
  const v = validateOpencodeProxyBody(JSON.stringify({ model: 'glm-5', max_tokens: 700 }), true);
  assert.equal(v.ok, true);
  const body = JSON.parse(v.body!) as { max_tokens: number };
  assert.equal(body.max_tokens, 700);
});
