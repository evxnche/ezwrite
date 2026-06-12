import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('WritingInterface wires an @agent mention popup alongside the slash popup', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/components/WritingInterface.tsx'), 'utf8');

  assert.match(source, /AgentMentionPopup/);
  assert.match(source, /mentionPopup/);
  assert.match(source, /activeLiveSessionAgents/);
});

test('WritingInterface routes live agent threads through the queue and reply helpers', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/components/WritingInterface.tsx'), 'utf8');

  assert.match(source, /buildAgentThreadStart/);
  assert.match(source, /applyAgentThreadStart/);
  assert.match(source, /applyAgentReplyEvent/);
  assert.match(source, /queueAgentTasks/);
  assert.match(source, /listPendingAgentReplies/);
  assert.match(source, /consumeAgentReplyEvents/);
});
