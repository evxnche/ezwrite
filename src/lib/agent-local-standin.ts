// Path 2 of live agent threads: ezWrite answers @agent prompts itself, locally,
// through the same BYOK/model layer the scratchpad uses — so the experience works
// end-to-end before (or without) a real external Claude/Codex/Gemini poll loop.
//
// Pure orchestration only: the model call is injected so this is unit-testable
// without a network or import.meta. WritingInterface passes the real
// completeScratchpadPrompt and the user's stored config.

import {
  type EncodedAgentReply,
  decodeAgentPromptLine,
  decodeAgentReplyLine,
} from './agent-live-session.ts';

export interface StandinTask {
  promptId: string;
  agentId: string;
  agentLabel: string;
  promptText: string;
}

/** Inject completeScratchpadPrompt (or a stub) — only the reply text is used. */
export type StandinComplete = (prompt: string) => Promise<{ text: string }>;

export function standinKey(promptId: string, agentId: string): string {
  return `${promptId}::${agentId}`;
}

// Each structured prompt line names its target agents; a stand-in is owed for any
// target whose reply placeholder is still pending. Derives entirely from the
// editor lines so it also covers placeholders left behind by a reload.
export function collectPendingStandinTasks(lines: string[]): StandinTask[] {
  const pending = new Set<string>();
  for (const line of lines) {
    const reply = decodeAgentReplyLine(line);
    if (reply?.status === 'pending') pending.add(standinKey(reply.promptId, reply.agentId));
  }

  const tasks: StandinTask[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const prompt = decodeAgentPromptLine(line);
    if (!prompt) continue;
    prompt.targetAgentIds.forEach((agentId, i) => {
      const key = standinKey(prompt.promptId, agentId);
      if (!pending.has(key) || seen.has(key)) return;
      seen.add(key);
      tasks.push({
        promptId: prompt.promptId,
        agentId,
        agentLabel: prompt.targetAgentLabels[i] ?? '',
        promptText: prompt.promptText,
      });
    });
  }
  return tasks;
}

export function buildStandinPrompt(promptText: string, agentLabel: string): string {
  return [
    `You are "${agentLabel}", a collaborator embedded directly in the user's document.`,
    'Answer their request concisely and directly, as prose they can drop straight into their notes.',
    "Don't restate the question or add a sign-off.",
    '',
    promptText,
  ].join('\n');
}

export async function generateStandinReply(
  task: StandinTask,
  complete: StandinComplete,
): Promise<EncodedAgentReply> {
  const base = { promptId: task.promptId, agentId: task.agentId, agentLabel: task.agentLabel };
  try {
    const { text } = await complete(buildStandinPrompt(task.promptText, task.agentLabel));
    const replyText = text.trim();
    if (!replyText) {
      return { ...base, replyText: 'no reply (the model returned nothing)', status: 'error' };
    }
    return { ...base, replyText, status: 'done' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'reply failed';
    return { ...base, replyText: `couldn't reply: ${message}`, status: 'error' };
  }
}
