import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AGENT_PROMPT_PREFIX,
  AGENT_REPLY_PREFIX,
  applyAgentReplyEvent,
  applyAgentThreadStart,
  buildAgentThreadStart,
  buildAgentPromptFingerprint,
  decodeAgentPromptLine,
  decodeAgentReplyLine,
  encodeAgentPromptLine,
  encodeAgentReplyLines,
  getTaggedActiveAgents,
  isAgentPromptLine,
  isAgentReplyLine,
  agentMentionScanText,
} from './agent-live-session.ts';

const activeAgents = [
  { id: 'pair-claude', label: 'Claude' },
  { id: 'pair-codex', label: 'Codex' },
  { id: 'pair-gemini', label: 'Gemini' },
];

test('agentMentionScanText returns a raw user line unchanged (never throws on a non-reply line)', () => {
  assert.equal(agentMentionScanText('@Claude what is the case for X?'), '@Claude what is the case for X?');
  assert.equal(agentMentionScanText('plain text'), 'plain text');
});

test('agentMentionScanText returns reply text for a completed reply, but the raw line for a pending one', () => {
  const [doneLine] = encodeAgentReplyLines({
    promptId: 'p1', agentId: 'a1', agentLabel: 'Claude', replyText: 'follow up with @Codex', status: 'done',
  });
  const [pendingLine] = encodeAgentReplyLines({
    promptId: 'p1', agentId: 'a1', agentLabel: 'Claude', replyText: 'thinking…', status: 'pending',
  });
  assert.equal(agentMentionScanText(doneLine), 'follow up with @Codex');
  assert.equal(agentMentionScanText(pendingLine), pendingLine);
});

test('getTaggedActiveAgents finds active agents anywhere in the line and preserves tag order', () => {
  assert.deepEqual(
    getTaggedActiveAgents('@Claude can you ask @Codex to review this after @Gemini checks facts?', activeAgents),
    [
      { id: 'pair-claude', label: 'Claude', handle: '@Claude' },
      { id: 'pair-codex', label: 'Codex', handle: '@Codex' },
      { id: 'pair-gemini', label: 'Gemini', handle: '@Gemini' },
    ],
  );
});

test('getTaggedActiveAgents ignores unknown mentions and duplicate tags for the same agent', () => {
  assert.deepEqual(
    getTaggedActiveAgents('@Claude ask @Unknown and @Claude again', activeAgents),
    [{ id: 'pair-claude', label: 'Claude', handle: '@Claude' }],
  );
});

test('encodeAgentPromptLine round-trips the visible prompt text and metadata', () => {
  const encoded = encodeAgentPromptLine({
    promptId: 'prompt-1',
    promptText: '@Claude critique the above',
    targetAgentIds: ['pair-claude'],
    targetAgentLabels: ['Claude'],
    fingerprint: 'fp-1',
  });

  assert.equal(isAgentPromptLine(encoded), true);
  assert.match(encoded, new RegExp(`^${AGENT_PROMPT_PREFIX}`));

  assert.deepEqual(decodeAgentPromptLine(encoded), {
    promptId: 'prompt-1',
    promptText: '@Claude critique the above',
    targetAgentIds: ['pair-claude'],
    targetAgentLabels: ['Claude'],
    fingerprint: 'fp-1',
  });
});

test('encodeAgentReplyLines emits one structured reply line per visible line', () => {
  const encoded = encodeAgentReplyLines({
    promptId: 'prompt-1',
    agentId: 'pair-claude',
    agentLabel: 'Claude',
    replyText: 'first line\nsecond line',
    status: 'done',
  });

  assert.deepEqual(encoded.map((line) => isAgentReplyLine(line)), [true, true]);
  assert.match(encoded[0], new RegExp(`^${AGENT_REPLY_PREFIX}`));
  assert.deepEqual(
    encoded.map((line) => decodeAgentReplyLine(line)),
    [
      {
        promptId: 'prompt-1',
        agentId: 'pair-claude',
        agentLabel: 'Claude',
        replyText: 'first line',
        status: 'done',
      },
      {
        promptId: 'prompt-1',
        agentId: 'pair-claude',
        agentLabel: 'Claude',
        replyText: 'second line',
        status: 'done',
      },
    ],
  );
});

test('buildAgentPromptFingerprint changes when the prompt text or active page changes', () => {
  assert.equal(
    buildAgentPromptFingerprint({
      projectId: 'doc-1',
      pageIndex: 0,
      promptText: '@Claude critique the above',
      targetAgentIds: ['pair-claude'],
    }),
    buildAgentPromptFingerprint({
      projectId: 'doc-1',
      pageIndex: 0,
      promptText: '@Claude critique the above',
      targetAgentIds: ['pair-claude'],
    }),
  );

  assert.notEqual(
    buildAgentPromptFingerprint({
      projectId: 'doc-1',
      pageIndex: 0,
      promptText: '@Claude critique the above',
      targetAgentIds: ['pair-claude'],
    }),
    buildAgentPromptFingerprint({
      projectId: 'doc-1',
      pageIndex: 1,
      promptText: '@Claude critique the above',
      targetAgentIds: ['pair-claude'],
    }),
  );

  assert.notEqual(
    buildAgentPromptFingerprint({
      projectId: 'doc-1',
      pageIndex: 0,
      promptText: '@Claude critique the above',
      targetAgentIds: ['pair-claude'],
    }),
    buildAgentPromptFingerprint({
      projectId: 'doc-1',
      pageIndex: 0,
      promptText: '@Claude rewrite this for me',
      targetAgentIds: ['pair-claude'],
    }),
  );
});

test('buildAgentThreadStart creates a structured prompt line, pending reply placeholders, and one task per tagged active agent', () => {
  const thread = buildAgentThreadStart({
    projectId: 'doc-1',
    pageIndex: 0,
    promptText: '@Claude @Codex review this',
    activeAgents,
  });

  assert.ok(thread);
  assert.equal(isAgentPromptLine(thread.promptLine), true);
  assert.equal(thread.replyPlaceholderLines.length, 2);
  assert.deepEqual(
    thread.tasks.map((task) => ({
      projectId: task.projectId,
      pageIndex: task.pageIndex,
      promptText: task.promptText,
      targetAgentId: task.targetAgentId,
      targetAgentLabel: task.targetAgentLabel,
    })),
    [
      {
        projectId: 'doc-1',
        pageIndex: 0,
        promptText: '@Claude @Codex review this',
        targetAgentId: 'pair-claude',
        targetAgentLabel: 'Claude',
      },
      {
        projectId: 'doc-1',
        pageIndex: 0,
        promptText: '@Claude @Codex review this',
        targetAgentId: 'pair-codex',
        targetAgentLabel: 'Codex',
      },
    ],
  );
  assert.deepEqual(
    thread.replyPlaceholderLines.map((line) => decodeAgentReplyLine(line)?.status),
    ['pending', 'pending'],
  );
});

test('buildAgentThreadStart ignores lines without active agent mentions', () => {
  assert.equal(
    buildAgentThreadStart({
      projectId: 'doc-1',
      pageIndex: 0,
      promptText: '@Unknown review this',
      activeAgents,
    }),
    null,
  );
});

test('applyAgentThreadStart replaces the raw prompt line and inserts pending replies underneath it', () => {
  const thread = buildAgentThreadStart({
    projectId: 'doc-1',
    pageIndex: 0,
    promptText: '@Claude review this',
    activeAgents,
  });
  assert.ok(thread);

  assert.deepEqual(
    applyAgentThreadStart(['before', '@Claude review this', 'after'], 1, thread),
    [
      'before',
      thread.promptLine,
      ...thread.replyPlaceholderLines,
      'after',
    ],
  );
});

test('applyAgentReplyEvent replaces the matching pending placeholder with the real reply lines', () => {
  const thread = buildAgentThreadStart({
    projectId: 'doc-1',
    pageIndex: 0,
    promptText: '@Claude review this',
    activeAgents,
  });
  assert.ok(thread);
  const [placeholder] = thread.replyPlaceholderLines;
  const placeholderReply = decodeAgentReplyLine(placeholder);
  assert.ok(placeholderReply);

  const next = applyAgentReplyEvent(
    [thread.promptLine, ...thread.replyPlaceholderLines],
    {
      promptId: thread.promptId,
      agentId: placeholderReply.agentId,
      agentLabel: placeholderReply.agentLabel,
      replyText: 'final answer\nsecond line',
      status: 'done',
    },
  );

  assert.deepEqual(next.map((line) => decodeAgentReplyLine(line)?.replyText ?? line), [
    thread.promptLine,
    'final answer',
    'second line',
  ]);
});
