import {
  buildScratchpadSystemPrompt,
  formatScratchpadLlmReply,
  getScratchpadModelChain,
  SCRATCHPAD_WEB_SEARCH_TOOL,
  type ScratchpadModelEntry,
} from './scratchpad-llm';

const OPENROUTER_CHAT_PATH = '/api/openrouter';

export interface ScratchpadLlmResult {
  text: string;
  model: string;
}

interface OpenRouterMessage {
  role: string;
  content?: string | null;
  reasoning?: string;
}

interface OpenRouterChoice {
  message?: OpenRouterMessage;
}

interface OpenRouterChatResponse {
  choices?: OpenRouterChoice[];
  error?: { message?: string; code?: number };
}

/** Fall through to the next model on rate limits, provider/upstream failures, and empty replies. */
function shouldTryNextModel(status: number): boolean {
  if (status === 429 || status === 408) return true;
  if (status >= 500 && status <= 599) return true;
  if (status === 400 || status === 404) return true;
  return false;
}

function extractAssistantContent(message?: OpenRouterMessage): string {
  const content = message?.content?.trim();
  if (content) return content;
  const reasoning = message?.reasoning?.trim();
  if (!reasoning) return '';
  const lines = reasoning.split('\n').map((line) => line.trim()).filter(Boolean);
  return lines[lines.length - 1] ?? '';
}

async function requestCompletion(
  entry: ScratchpadModelEntry,
  prompt: string,
  signal?: AbortSignal,
): Promise<{ ok: true; content: string } | { ok: false; status: number; message: string }> {
  const body: Record<string, unknown> = {
    model: entry.id,
    messages: [
      { role: 'system', content: buildScratchpadSystemPrompt(entry.id, entry.webSearch) },
      { role: 'user', content: prompt },
    ],
    max_tokens: entry.webSearch ? 500 : 700,
  };
  if (entry.webSearch) {
    body.tools = [SCRATCHPAD_WEB_SEARCH_TOOL];
  }

  let res: Response;
  try {
    res = await fetch(OPENROUTER_CHAT_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    const message = error instanceof Error ? error.message : 'Network error';
    return { ok: false, status: 503, message };
  }

  const payload = await res.json().catch(() => ({})) as OpenRouterChatResponse;

  if (!res.ok) {
    let message = payload.error?.message ?? `OpenRouter request failed (${res.status})`;
    if (res.status === 404) {
      message = 'Scratchpad AI endpoint missing on this host (deploy api/openrouter and set OPENROUTER_API_KEY).';
    }
    const status = typeof payload.error?.code === 'number' ? payload.error.code : res.status;
    return { ok: false, status, message };
  }

  const content = extractAssistantContent(payload.choices?.[0]?.message);
  if (!content) {
    return { ok: false, status: 502, message: 'OpenRouter returned an empty response' };
  }

  return { ok: true, content };
}

export async function completeScratchpadPrompt(
  prompt: string,
  signal?: AbortSignal,
): Promise<ScratchpadLlmResult> {
  const chain = getScratchpadModelChain(prompt);
  const errors: string[] = [];

  for (const entry of chain) {
    const result = await requestCompletion(entry, prompt, signal);

    if (result.ok) {
      return {
        text: formatScratchpadLlmReply(result.content),
        model: entry.id,
      };
    }

    if (shouldTryNextModel(result.status)) {
      errors.push(`${entry.id}: ${result.message}`);
      continue;
    }

    throw new Error(result.message);
  }

  const detail = errors.length > 0 ? errors.join(' → ') : 'All models failed';
  throw new Error(`${detail}. Wait a minute and try again.`);
}
