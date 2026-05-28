import {
  buildScratchpadSystemPrompt,
  formatScratchpadLlmReply,
  SCRATCHPAD_LLM_MODELS,
  SCRATCHPAD_WEB_SEARCH_TOOL,
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
  model: string,
  prompt: string,
  signal?: AbortSignal,
): Promise<{ ok: true; content: string } | { ok: false; status: number; message: string }> {
  let res: Response;
  try {
    res = await fetch(OPENROUTER_CHAT_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: buildScratchpadSystemPrompt(model) },
          { role: 'user', content: prompt },
        ],
        tools: [SCRATCHPAD_WEB_SEARCH_TOOL],
        max_tokens: 700,
      }),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    const message = error instanceof Error ? error.message : 'Network error';
    return { ok: false, status: 503, message };
  }

  const payload = await res.json().catch(() => ({})) as OpenRouterChatResponse;

  if (!res.ok) {
    const message = payload.error?.message ?? `OpenRouter request failed (${res.status})`;
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
  const errors: string[] = [];

  for (const model of SCRATCHPAD_LLM_MODELS) {
    const result = await requestCompletion(model, prompt, signal);

    if (result.ok) {
      return {
        text: formatScratchpadLlmReply(result.content),
        model,
      };
    }

    if (shouldTryNextModel(result.status)) {
      errors.push(`${model}: ${result.message}`);
      continue;
    }

    throw new Error(result.message);
  }

  const detail = errors.length > 0 ? errors[errors.length - 1] : 'All models failed';
  throw new Error(`${detail}. Wait a minute and try again.`);
}
