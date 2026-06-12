export const AGENT_PROMPT_PREFIX = 'agentprompt::';
export const AGENT_REPLY_PREFIX = 'agentreply::';

export interface ActiveAgentOption {
  id: string;
  label: string;
}

export interface TaggedActiveAgent extends ActiveAgentOption {
  handle: string;
}

export interface EncodedAgentPrompt {
  promptId: string;
  promptText: string;
  targetAgentIds: string[];
  targetAgentLabels: string[];
  fingerprint: string;
}

export interface EncodedAgentReply {
  promptId: string;
  agentId: string;
  agentLabel: string;
  replyText: string;
  status: 'pending' | 'done' | 'error';
}

export interface AgentTaskPayload {
  taskId: string;
  promptId: string;
  projectId: string;
  pageIndex: number;
  promptText: string;
  fingerprint: string;
  targetAgentId: string;
  targetAgentLabel: string;
}

function escapeSegment(value: string): string {
  return encodeURIComponent(value);
}

function unescapeSegment(value: string): string {
  return decodeURIComponent(value);
}

function encodeList(values: string[]): string {
  return escapeSegment(JSON.stringify(values));
}

function decodeList(value: string): string[] {
  try {
    const parsed = JSON.parse(unescapeSegment(value)) as unknown;
    return Array.isArray(parsed) ? parsed.map((entry) => String(entry ?? '')) : [];
  } catch {
    return [];
  }
}

function encodeParts(prefix: string, parts: string[]): string {
  return `${prefix}${parts.map(escapeSegment).join('|')}`;
}

function decodeParts(prefix: string, line: string): string[] {
  if (!line.startsWith(prefix)) return [];
  return line.slice(prefix.length).split('|').map(unescapeSegment);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function getTaggedActiveAgents(text: string, activeAgents: ActiveAgentOption[]): TaggedActiveAgent[] {
  const matches = activeAgents
    .map((agent) => {
      const regex = new RegExp(`(^|[^\\w])(@${escapeRegex(agent.label)})(?=$|[^\\w])`, 'gi');
      const found = regex.exec(text);
      return found
        ? {
            id: agent.id,
            label: agent.label,
            handle: found[2],
            index: found.index + found[1].length,
          }
        : null;
    })
    .filter((entry): entry is TaggedActiveAgent & { index: number } => Boolean(entry))
    .sort((a, b) => a.index - b.index);

  const seen = new Set<string>();
  return matches.filter((entry) => {
    if (seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  }).map(({ index: _index, ...agent }) => agent);
}

export function buildAgentPromptFingerprint(input: {
  projectId: string;
  pageIndex: number;
  promptText: string;
  targetAgentIds: string[];
}): string {
  return JSON.stringify([
    input.projectId,
    input.pageIndex,
    input.promptText.trim(),
    [...input.targetAgentIds].sort(),
  ]);
}

export function encodeAgentPromptLine(prompt: EncodedAgentPrompt): string {
  return encodeParts(AGENT_PROMPT_PREFIX, [
    prompt.promptId,
    prompt.fingerprint,
    encodeList(prompt.targetAgentIds),
    encodeList(prompt.targetAgentLabels),
    prompt.promptText,
  ]);
}

export function decodeAgentPromptLine(line: string): EncodedAgentPrompt | null {
  const parts = decodeParts(AGENT_PROMPT_PREFIX, line);
  if (parts.length !== 5) return null;
  return {
    promptId: parts[0],
    fingerprint: parts[1],
    targetAgentIds: decodeList(parts[2]),
    targetAgentLabels: decodeList(parts[3]),
    promptText: parts[4],
  };
}

export function encodeAgentReplyLines(reply: EncodedAgentReply): string[] {
  return reply.replyText.split('\n').map((line) => encodeParts(AGENT_REPLY_PREFIX, [
    reply.promptId,
    reply.agentId,
    reply.agentLabel,
    reply.status,
    line,
  ]));
}

export function decodeAgentReplyLine(line: string): EncodedAgentReply | null {
  const parts = decodeParts(AGENT_REPLY_PREFIX, line);
  if (parts.length !== 5) return null;
  const status = parts[3];
  if (status !== 'pending' && status !== 'done' && status !== 'error') return null;
  return {
    promptId: parts[0],
    agentId: parts[1],
    agentLabel: parts[2],
    status,
    replyText: parts[4],
  };
}

export function isAgentPromptLine(line: string): boolean {
  return line.startsWith(AGENT_PROMPT_PREFIX);
}

export function isAgentReplyLine(line: string): boolean {
  return line.startsWith(AGENT_REPLY_PREFIX);
}

function newThreadId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function buildAgentThreadStart(input: {
  projectId: string;
  pageIndex: number;
  promptText: string;
  activeAgents: ActiveAgentOption[];
}): { promptId: string; promptLine: string; replyPlaceholderLines: string[]; tasks: AgentTaskPayload[] } | null {
  const taggedAgents = getTaggedActiveAgents(input.promptText, input.activeAgents);
  if (taggedAgents.length === 0) return null;
  const promptId = newThreadId('prompt');
  const fingerprint = buildAgentPromptFingerprint({
    projectId: input.projectId,
    pageIndex: input.pageIndex,
    promptText: input.promptText,
    targetAgentIds: taggedAgents.map((agent) => agent.id),
  });
  return {
    promptId,
    promptLine: encodeAgentPromptLine({
      promptId,
      promptText: input.promptText,
      targetAgentIds: taggedAgents.map((agent) => agent.id),
      targetAgentLabels: taggedAgents.map((agent) => agent.label),
      fingerprint,
    }),
    replyPlaceholderLines: taggedAgents.flatMap((agent) => encodeAgentReplyLines({
      promptId,
      agentId: agent.id,
      agentLabel: agent.label,
      replyText: 'thinking…',
      status: 'pending',
    })),
    tasks: taggedAgents.map((agent) => ({
      taskId: newThreadId('task'),
      promptId,
      projectId: input.projectId,
      pageIndex: input.pageIndex,
      promptText: input.promptText,
      fingerprint,
      targetAgentId: agent.id,
      targetAgentLabel: agent.label,
    })),
  };
}

export function applyAgentThreadStart(lines: string[], lineIndex: number, thread: {
  promptLine: string;
  replyPlaceholderLines: string[];
}): string[] {
  return [
    ...lines.slice(0, lineIndex),
    thread.promptLine,
    ...thread.replyPlaceholderLines,
    ...lines.slice(lineIndex + 1),
  ];
}

export function applyAgentReplyEvent(lines: string[], reply: EncodedAgentReply): string[] {
  const renderedReplyLines = encodeAgentReplyLines(reply);
  const next = [...lines];
  const placeholderIndex = next.findIndex((line) => {
    const decoded = decodeAgentReplyLine(line);
    return decoded?.promptId === reply.promptId
      && decoded.agentId === reply.agentId
      && decoded.status === 'pending';
  });
  if (placeholderIndex >= 0) {
    next.splice(placeholderIndex, 1, ...renderedReplyLines);
    return next;
  }

  const promptIndex = next.findIndex((line) => decodeAgentPromptLine(line)?.promptId === reply.promptId);
  if (promptIndex >= 0) {
    next.splice(promptIndex + 1, 0, ...renderedReplyLines);
    return next;
  }

  return [...next, ...renderedReplyLines];
}
