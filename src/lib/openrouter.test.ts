import test from 'node:test';
import assert from 'node:assert/strict';

import * as scratchpadLlm from './scratchpad-llm.ts';

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
