import test from 'node:test';
import assert from 'node:assert/strict';

import { contentToHTML, getLineType } from './writing-helpers.ts';
import { encodeAgentPromptLine, encodeAgentReplyLines } from '../lib/agent-live-session.ts';

test('getLineType recognizes structured agent prompt lines', () => {
  const line = encodeAgentPromptLine({
    promptId: 'prompt-1',
    promptText: '@Claude critique the above',
    targetAgentIds: ['pair-claude'],
    targetAgentLabels: ['Claude'],
    fingerprint: 'fp-1',
  });

  assert.equal(getLineType([line], 0), 'agent-prompt');
});

test('getLineType recognizes structured agent reply lines', () => {
  const [line] = encodeAgentReplyLines({
    promptId: 'prompt-1',
    agentId: 'pair-claude',
    agentLabel: 'Claude',
    replyText: 'looks good',
    status: 'done',
  });

  assert.equal(getLineType([line], 0), 'agent-reply');
});

test('contentToHTML renders visible text for agent prompts and reply blocks', () => {
  const prompt = encodeAgentPromptLine({
    promptId: 'prompt-1',
    promptText: '@Claude critique the above',
    targetAgentIds: ['pair-claude'],
    targetAgentLabels: ['Claude'],
    fingerprint: 'fp-1',
  });
  const replies = encodeAgentReplyLines({
    promptId: 'prompt-1',
    agentId: 'pair-claude',
    agentLabel: 'Claude',
    replyText: 'first thought\nsecond thought',
    status: 'done',
  });

  const html = contentToHTML([prompt, ...replies].join('\n'));

  assert.match(html, /data-type="agent-prompt"/);
  assert.match(html, /@Claude critique the above/);
  assert.match(html, /data-type="agent-reply"/);
  assert.match(html, /data-agent-label="Claude"/);
  assert.match(html, /first thought/);
  assert.match(html, /second thought/);
});
