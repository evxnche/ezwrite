import test from 'node:test';
import assert from 'node:assert/strict';

import { validateScratchpadProxyBody } from './openrouter-upstream.ts';

test('allows a known free model and forwards the body', () => {
  const v = validateScratchpadProxyBody(JSON.stringify({ model: 'openrouter/free', messages: [] }));
  assert.equal(v.ok, true);
  assert.ok(v.body);
});

test('allows any :free model (future-proof)', () => {
  const v = validateScratchpadProxyBody(JSON.stringify({ model: 'some/new-model:free', messages: [] }));
  assert.equal(v.ok, true);
});

test('rejects a paid model — the cost-drain fix', () => {
  const v = validateScratchpadProxyBody(JSON.stringify({ model: 'anthropic/claude-3-opus', messages: [] }));
  assert.equal(v.ok, false);
  assert.equal(v.status, 403);
});

test('rejects a missing/non-string model', () => {
  assert.equal(validateScratchpadProxyBody(JSON.stringify({ messages: [] })).status, 403);
  assert.equal(validateScratchpadProxyBody(JSON.stringify({ model: 42 })).status, 403);
});

test('rejects invalid JSON', () => {
  assert.equal(validateScratchpadProxyBody('not json').status, 400);
});

test('rejects an oversized body', () => {
  const huge = JSON.stringify({ model: 'openrouter/free', blob: 'x'.repeat(250_000) });
  assert.equal(validateScratchpadProxyBody(huge).status, 413);
});

test('clamps an excessive max_tokens', () => {
  const v = validateScratchpadProxyBody(JSON.stringify({ model: 'openrouter/free', max_tokens: 1_000_000 }));
  assert.equal(v.ok, true);
  assert.equal((JSON.parse(v.body!) as { max_tokens: number }).max_tokens, 4096);
});

test('defaults max_tokens when absent or invalid', () => {
  const v = validateScratchpadProxyBody(JSON.stringify({ model: 'openrouter/free' }));
  assert.equal((JSON.parse(v.body!) as { max_tokens: number }).max_tokens, 4096);
});
