import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildScratchpadSystemPrompt,
  formatScratchpadLlmReply,
  isScratchpadLlmLine,
  parseScratchpadLlmPrompt,
  SCRATCHPAD_LLM_MODEL,
  SCRATCHPAD_LLM_MODELS,
  splitScratchpadLlmResponse,
  stripScratchpadLlmBoilerplate,
} from './scratchpad-llm.ts';

test('scratchpad model fallback chain ends with openrouter/free auto router', () => {
  assert.deepEqual(SCRATCHPAD_LLM_MODELS, [
    'deepseek/deepseek-v4-flash:free',
    'google/gemma-4-31b-it:free',
    'z-ai/glm-4.5-air:free',
    'openrouter/free',
  ]);
  assert.equal(SCRATCHPAD_LLM_MODEL, 'deepseek/deepseek-v4-flash:free');
  assert.equal(SCRATCHPAD_LLM_MODELS.at(-1), 'openrouter/free');
});

test('parseScratchpadLlmPrompt reads // lines only when prompt is non-empty', () => {
  assert.equal(parseScratchpadLlmPrompt('// explain tides'), 'explain tides');
  assert.equal(parseScratchpadLlmPrompt('  //  hello  '), 'hello');
  assert.equal(parseScratchpadLlmPrompt('//'), null);
  assert.equal(parseScratchpadLlmPrompt('/line'), null);
});

test('isScratchpadLlmLine detects // prefix', () => {
  assert.equal(isScratchpadLlmLine('// draft'), true);
  assert.equal(isScratchpadLlmLine('/list'), false);
});

test('splitScratchpadLlmResponse preserves paragraph breaks', () => {
  assert.deepEqual(splitScratchpadLlmResponse('one\n\ntwo'), ['one', '', 'two']);
});

test('system prompt demands zero preamble and silent search', () => {
  const prompt = buildScratchpadSystemPrompt('google/gemma-4-31b-it:free');
  assert.match(prompt, /google\/gemma-4-31b-it:free/);
  assert.match(prompt, /Never mention searching/i);
  assert.match(prompt, /No titles, headings/i);
  assert.match(prompt, /First token is the answer/i);
});

test('stripScratchpadLlmBoilerplate removes search preambles and title lines', () => {
  const raw = [
    "I'll search for the latest news on the Iran war to get you current information.",
    '',
    '**Latest Iran war developments**',
    '',
    '• Point one about ceasefire talks.',
    '• Point two from yesterday.',
  ].join('\n');
  assert.equal(
    stripScratchpadLlmBoilerplate(raw),
    '• Point one about ceasefire talks.\n• Point two from yesterday.',
  );
});

test('formatScratchpadLlmReply strips boilerplate only, no model footer', () => {
  assert.equal(formatScratchpadLlmReply('Hello.'), 'Hello.');
});
