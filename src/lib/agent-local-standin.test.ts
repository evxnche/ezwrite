import test from 'node:test';
import assert from 'node:assert/strict';

import {
  encodeAgentPromptLine,
  encodeAgentReplyLines,
  buildAgentPromptFingerprint,
} from './agent-live-session.ts';
import {
  buildStandinPrompt,
  collectPendingStandinTasks,
  generateStandinReply,
  standinKey,
} from './agent-local-standin.ts';

function promptLine(promptId: string, promptText: string, ids: string[], labels: string[]): string {
  return encodeAgentPromptLine({
    promptId,
    promptText,
    targetAgentIds: ids,
    targetAgentLabels: labels,
    fingerprint: buildAgentPromptFingerprint({ projectId: 'p', pageIndex: 0, promptText, targetAgentIds: ids }),
  });
}

function pendingReply(promptId: string, agentId: string, label: string): string[] {
  return encodeAgentReplyLines({ promptId, agentId, agentLabel: label, replyText: 'thinking…', status: 'pending' });
}

function doneReply(promptId: string, agentId: string, label: string): string[] {
  return encodeAgentReplyLines({ promptId, agentId, agentLabel: label, replyText: 'all done', status: 'done' });
}

test('collectPendingStandinTasks returns one task per pending placeholder with the prompt text', () => {
  const lines = [
    'some intro text',
    promptLine('prompt-1', '@research what is the case for X?', ['a1'], ['research']),
    ...pendingReply('prompt-1', 'a1', 'research'),
    'trailing text',
  ];
  const tasks = collectPendingStandinTasks(lines);
  assert.equal(tasks.length, 1);
  assert.deepEqual(tasks[0], {
    promptId: 'prompt-1',
    agentId: 'a1',
    agentLabel: 'research',
    promptText: '@research what is the case for X?',
  });
});

test('collectPendingStandinTasks ignores placeholders that are already answered', () => {
  const lines = [
    promptLine('prompt-1', 'q', ['a1'], ['research']),
    ...doneReply('prompt-1', 'a1', 'research'),
  ];
  assert.deepEqual(collectPendingStandinTasks(lines), []);
});

test('collectPendingStandinTasks handles multiple agents on one prompt', () => {
  const lines = [
    promptLine('prompt-1', '@research and @editor weigh in', ['a1', 'a2'], ['research', 'editor']),
    ...pendingReply('prompt-1', 'a1', 'research'),
    ...pendingReply('prompt-1', 'a2', 'editor'),
  ];
  const tasks = collectPendingStandinTasks(lines);
  assert.equal(tasks.length, 2);
  assert.deepEqual(tasks.map((t) => t.agentId).sort(), ['a1', 'a2']);
});

test('collectPendingStandinTasks ignores prompts with no placeholder yet', () => {
  const lines = [promptLine('prompt-1', 'q', ['a1'], ['research'])];
  assert.deepEqual(collectPendingStandinTasks(lines), []);
});

test('buildStandinPrompt embeds the agent label and the user request', () => {
  const built = buildStandinPrompt('@research summarise this', 'research');
  assert.match(built, /research/);
  assert.match(built, /summarise this/);
});

test('generateStandinReply returns a done reply from the model text', async () => {
  const reply = await generateStandinReply(
    { promptId: 'p1', agentId: 'a1', agentLabel: 'research', promptText: '@research hi' },
    async () => ({ text: 'Here is the answer.\nSecond line.' }),
  );
  assert.equal(reply.status, 'done');
  assert.equal(reply.promptId, 'p1');
  assert.equal(reply.agentId, 'a1');
  assert.equal(reply.agentLabel, 'research');
  assert.equal(reply.replyText, 'Here is the answer.\nSecond line.');
});

test('generateStandinReply returns an error reply when the model throws', async () => {
  const reply = await generateStandinReply(
    { promptId: 'p1', agentId: 'a1', agentLabel: 'research', promptText: '@research hi' },
    async () => { throw new Error('no api key'); },
  );
  assert.equal(reply.status, 'error');
  assert.match(reply.replyText, /no api key/);
});

test('generateStandinReply never lets an empty model reply look done', async () => {
  const reply = await generateStandinReply(
    { promptId: 'p1', agentId: 'a1', agentLabel: 'research', promptText: '@research hi' },
    async () => ({ text: '   ' }),
  );
  assert.equal(reply.status, 'error');
});

test('standinKey is stable per prompt+agent', () => {
  assert.equal(standinKey('p1', 'a1'), standinKey('p1', 'a1'));
  assert.notEqual(standinKey('p1', 'a1'), standinKey('p1', 'a2'));
});
