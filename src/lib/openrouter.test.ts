import test from 'node:test';
import assert from 'node:assert/strict';

import * as scratchpadLlm from './scratchpad-llm.ts';
import { completeScratchpadPrompt, extractAssistantContent, extractWebEvidence } from './openrouter.ts';

test('live-data detection fires on time-sensitive prompts but not definitional ones', () => {
  const needs = scratchpadLlm.scratchpadNeedsLiveData;
  // These should auto-route off OpenCode (which can't browse) to web search.
  assert.equal(needs('what is the latest anthropic model?'), true);
  assert.equal(needs('who won the game yesterday'), true);
  assert.equal(needs('current weather in tokyo'), true);
  assert.equal(needs('news about the election'), true);
  assert.equal(needs('Prime Minister of Hungary'), true);
  assert.equal(needs('CEO of Apple'), true);
  // These are answerable from the model's own knowledge — keep them on OpenCode.
  assert.equal(needs('what is a haiku?'), false);
  assert.equal(needs('rewrite this sentence to be punchier'), false);
  assert.equal(needs('explain recursion'), false);
});

test('a failed live lookup does not fall through to stale OpenCode answers', async () => {
  const originalFetch = globalThis.fetch;
  const requestedModels: string[] = [];
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { model: string };
    requestedModels.push(body.model);
    return new Response(JSON.stringify({ error: { message: 'search unavailable' } }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    await assert.rejects(
      completeScratchpadPrompt('latest updates on the Iran war', undefined, { provider: 'opencode' }),
      /live lookup failed/i,
    );
    assert.deepEqual(requestedModels, ['openrouter/free']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('live lookups synthesize from retrieved evidence instead of trusting a stale search answer', async () => {
  const originalFetch = globalThis.fetch;
  const requestedModels: string[] = [];
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { model: string };
    requestedModels.push(body.model);
    if (body.model === 'openrouter/free') {
      return Response.json({
        choices: [{
          finish_reason: 'stop',
          message: {
            role: 'assistant',
            content: 'Viktor Orbán',
            annotations: [{
              type: 'url_citation',
              url_citation: {
                title: 'Hungarian Government',
                content: 'Péter Magyar has served as Prime Minister of Hungary since 9 May 2026.',
              },
            }],
          },
        }],
      });
    }
    return Response.json({
      choices: [{
        finish_reason: 'stop',
        message: { role: 'assistant', content: 'Péter Magyar, since 9 May 2026.' },
      }],
    });
  };

  try {
    const result = await completeScratchpadPrompt(
      'Prime Minister of Hungary',
      undefined,
      { provider: 'opencode' },
    );
    assert.equal(result.text, 'Péter Magyar, since 9 May 2026.');
    assert.deepEqual(requestedModels, ['openrouter/free', 'google/gemma-4-31b-it:free']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('web evidence extraction keeps citation text and drops URLs', () => {
  assert.equal(
    extractWebEvidence({
      role: 'assistant',
      annotations: [{
        type: 'url_citation',
        url_citation: { title: 'Official page', url: 'https://example.com', content: 'Current fact.' },
      }],
    }),
    'Official page\nCurrent fact.',
  );
});

test('a normal reply uses message content', () => {
  assert.equal(
    extractAssistantContent({ message: { role: 'assistant', content: 'the answer' }, finish_reason: 'stop' }),
    'the answer',
  );
});

test('a reply truncated mid-reasoning yields nothing — never the unfinished thought', () => {
  // deepseek-v4-flash burns the token budget on reasoning_content and returns
  // empty content with finish_reason "length". The old code surfaced the last
  // reasoning line as a mid-sentence fragment; now it returns empty so the
  // chain falls through instead.
  assert.equal(
    extractAssistantContent({
      message: { role: 'assistant', content: '', reasoning_content: 'Let me think...\nGeneral/Personal Leave:' },
      finish_reason: 'length',
    }),
    '',
  );
});

test('when a model finishes but answers only in reasoning, the last line is used', () => {
  assert.equal(
    extractAssistantContent({
      message: { role: 'assistant', content: '', reasoning: 'thinking out loud\nFinal answer here' },
      finish_reason: 'stop',
    }),
    'Final answer here',
  );
});

test('Groq-style key-only BYOK resolves to the Groq endpoint and default model', () => {
  const resolveConfig = scratchpadLlm.resolveScratchpadLLMConfig;
  const resolved = resolveConfig?.({
    apiKey: 'gsk_test_key',
  });

  assert.deepEqual(
    resolved && {
      provider: resolved.provider,
      baseURL: resolved.baseURL,
      model: resolved.model,
      validationError: resolved.validationError,
    },
    {
      provider: 'groq',
      baseURL: 'https://api.groq.com/openai/v1',
      model: 'llama-3.3-70b-versatile',
      validationError: undefined,
    },
  );
});

test('an opencode.ai base URL (even a full endpoint URL) resolves to the opencode provider', () => {
  const resolved = scratchpadLlm.resolveScratchpadLLMConfig({
    apiKey: 'some-zen-key',
    baseURL: 'https://opencode.ai/zen/go/v1/chat/completions',
    model: 'mimo-v2.5',
  });

  assert.equal(resolved.provider, 'opencode');
  // /chat/completions is appended by the request code, so it must be stripped here.
  assert.equal(resolved.baseURL, 'https://opencode.ai/zen/go/v1');
  assert.equal(resolved.validationError, undefined);
});

test('opencode with just a key needs no base URL or model — defaults fill in', () => {
  const resolved = scratchpadLlm.resolveScratchpadLLMConfig({
    provider: 'opencode',
    apiKey: 'some-zen-key',
  });

  assert.equal(resolved.provider, 'opencode');
  assert.equal(resolved.baseURL, 'https://opencode.ai/zen/v1');
  assert.equal(resolved.model, scratchpadLlm.SCRATCHPAD_OPENCODE_MODEL);
  assert.equal(resolved.validationError, undefined);
});

test('keyless opencode is valid and defaults to a free zen model', () => {
  const resolved = scratchpadLlm.resolveScratchpadLLMConfig({ provider: 'opencode' });

  assert.equal(resolved.provider, 'opencode');
  assert.equal(resolved.model, scratchpadLlm.SCRATCHPAD_OPENCODE_FREE_MODEL);
  assert.equal(resolved.validationError, undefined);
});

test('a custom base URL pasted with /chat/completions is normalized for any provider', () => {
  const resolved = scratchpadLlm.resolveScratchpadLLMConfig({
    apiKey: 'sk-custom-test',
    baseURL: 'https://api.example.com/v1/chat/completions/',
    model: 'some-model',
  });

  assert.equal(resolved.provider, 'openai-compatible');
  assert.equal(resolved.baseURL, 'https://api.example.com/v1');
  assert.equal(resolved.validationError, undefined);
});

test('custom OpenAI-compatible BYOK surfaces a validation error until base URL and model are set', () => {
  const resolveConfig = scratchpadLlm.resolveScratchpadLLMConfig;
  const resolved = resolveConfig?.({
    provider: 'openai-compatible',
    apiKey: 'sk-custom-test',
  });

  assert.equal(
    resolved?.validationError,
    'Custom OpenAI-compatible providers need both a base URL and model.',
  );
});
