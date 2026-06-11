import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildScratchpadSystemPrompt,
  formatScratchpadLlmReply,
  getScratchpadLLMConfig,
  getScratchpadModelChain,
  isScratchpadLlmLine,
  parseScratchpadLlmPrompt,
  resolveScratchpadLLMConfig,
  scratchpadNeedsWebSearch,
  SCRATCHPAD_LLM_MODEL,
  setScratchpadLLMConfig,
  splitScratchpadLlmResponse,
} from './scratchpad-llm.ts';

test('fast chain is default; web-search chain puts GLM first', () => {
  assert.equal(SCRATCHPAD_LLM_MODEL, 'deepseek/deepseek-v4-flash:free');
  const fast = getScratchpadModelChain('rewrite this sentence');
  assert.equal(fast[0].id, 'deepseek/deepseek-v4-flash:free');
  assert.equal(fast[0].webSearch, false);

  const search = getScratchpadModelChain('how does cursor model usage work?');
  assert.equal(scratchpadNeedsWebSearch('how does cursor model usage work?'), true);
  assert.equal(search[0].id, 'z-ai/glm-4.5-air:free');
  assert.equal(search[0].webSearch, true);
  assert.equal(search[1].id, 'openrouter/free');
  assert.equal(search[2].webSearch, false);
});

test('parseScratchpadLlmPrompt reads // lines only when prompt is non-empty', () => {
  assert.equal(parseScratchpadLlmPrompt('// explain tides'), 'explain tides');
  assert.equal(parseScratchpadLlmPrompt('//'), null);
});

test('isScratchpadLlmLine detects // prefix', () => {
  assert.equal(isScratchpadLlmLine('// draft'), true);
  assert.equal(isScratchpadLlmLine('/list'), false);
});

test('splitScratchpadLlmResponse preserves paragraph breaks', () => {
  assert.deepEqual(splitScratchpadLlmResponse('one\n\ntwo'), ['one', '', 'two']);
});

test('system prompt demands zero preamble when web search enabled', () => {
  const prompt = buildScratchpadSystemPrompt('z-ai/glm-4.5-air:free', true);
  assert.match(prompt, /Never mention searching/i);
  assert.match(prompt, /First token is the answer/i);
});

test('formatScratchpadLlmReply strips boilerplate only', () => {
  assert.equal(formatScratchpadLlmReply('Hello.'), 'Hello.');
});

test('provider-only scratchpad selections persist for non-default providers', () => {
  const originalLocalStorage = globalThis.localStorage;
  const store = new Map<string, string>();
  const mockLocalStorage = {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
  };

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: mockLocalStorage,
  });

  try {
    setScratchpadLLMConfig({ provider: 'groq' });
    assert.deepEqual(getScratchpadLLMConfig(), { provider: 'groq' });
    assert.equal(resolveScratchpadLLMConfig(getScratchpadLLMConfig()).provider, 'groq');

    setScratchpadLLMConfig({});
    assert.deepEqual(getScratchpadLLMConfig(), {});
  } finally {
    if (originalLocalStorage === undefined) {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    } else {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: originalLocalStorage,
      });
    }
  }
});
