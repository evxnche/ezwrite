import {
  buildScratchpadSystemPrompt,
  formatScratchpadLlmReply,
  getScratchpadModelChain,
  resolveScratchpadLLMConfig,
  SCRATCHPAD_WEB_SEARCH_TOOL,
  type ResolvedScratchpadLLMConfig,
  type ScratchpadLLMConfig,
  type ScratchpadModelEntry,
} from './scratchpad-llm.ts';

const OPENROUTER_CHAT_PATH = '/api/openrouter';
const OPENROUTER_DIRECT_URL = 'https://openrouter.ai/api/v1/chat/completions';

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
  config?: ResolvedScratchpadLLMConfig,
): Promise<{ ok: true; content: string } | { ok: false; status: number; message: string }> {
  const apiKey = config?.apiKey;
  const isAnthropic = config?.provider === 'anthropic';

  if (isAnthropic && apiKey) {
    // Anthropic Messages API path
    const base = config.baseURL!.trim().replace(/\/+$/, '');
    const targetURL = `${base}/v1/messages`;

    const system = buildScratchpadSystemPrompt(entry.id, false); // no web tools for anthropic yet

    const body = {
      model: entry.id,
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: prompt }],
    };

    let res: Response;
    try {
      res = await fetch(targetURL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      const message = error instanceof Error ? error.message : 'Network error';
      return { ok: false, status: 503, message };
    }

    const payload = await res.json().catch(() => ({})) as { error?: { message?: string }; message?: string; content?: Array<{ type: string; text?: string }> };

    if (!res.ok) {
      const msg = payload?.error?.message || payload?.message || `Anthropic request failed (${res.status})`;
      return { ok: false, status: res.status, message: msg };
    }

    const text = payload?.content?.find?.((c) => c.type === 'text')?.text || '';
    if (!text) {
      return { ok: false, status: 502, message: 'Anthropic returned empty response' };
    }
    return { ok: true, content: text };
  }

  // OpenAI-compatible / OpenRouter path (existing)
  const usingOpenRouter = config?.provider === 'openrouter';
  const isDirect = !!apiKey;

  let targetURL: string;
  if (!isDirect) {
    targetURL = OPENROUTER_CHAT_PATH;
  } else if (usingOpenRouter) {
    targetURL = OPENROUTER_DIRECT_URL;
  } else {
    const base = config!.baseURL!.trim().replace(/\/+$/, '');
    targetURL = `${base}/chat/completions`;
  }

  const body: Record<string, unknown> = {
    model: entry.id,
    messages: [
      { role: 'system', content: buildScratchpadSystemPrompt(entry.id, entry.webSearch) },
      { role: 'user', content: prompt },
    ],
    max_tokens: entry.webSearch ? 500 : 700,
  };

  if (entry.webSearch && usingOpenRouter) {
    body.tools = [SCRATCHPAD_WEB_SEARCH_TOOL];
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (isDirect) {
    headers.Authorization = `Bearer ${apiKey}`;
    if (usingOpenRouter) {
      let referer = 'https://ezwrite.evanche.xyz';
      if (typeof window !== 'undefined' && window.location?.origin) {
        referer = window.location.origin;
      }
      headers['HTTP-Referer'] = referer;
      headers['X-Title'] = 'ezwrite';
    }
  }

  let res: Response;
  try {
    res = await fetch(targetURL, {
      method: 'POST',
      headers,
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
    let message = payload.error?.message ?? `LLM request failed (${res.status})`;
    if (isDirect && (res.status === 401 || res.status === 403)) {
      message = usingOpenRouter
        ? 'Invalid OpenRouter API key (401/403). Check or clear it in settings.'
        : config?.provider === 'groq'
          ? 'Invalid Groq API key (401/403). Check or clear it in settings.'
          : 'Invalid API key or base URL (401/403). Check your settings.';
    } else if (!isDirect && res.status === 404) {
      message = 'Scratchpad AI endpoint missing on this host (deploy api/openrouter and set OPENROUTER_API_KEY).';
    } else if (!isDirect && res.status === 502 && !payload.error?.message) {
      message = 'Scratchpad proxy failed — redeploy with api/openrouter.ts';
    }
    const code = payload.error?.code;
    const status = typeof code === 'number' ? code : res.status;
    return { ok: false, status, message };
  }

  const content = extractAssistantContent(payload.choices?.[0]?.message);
  if (!content) {
    return { ok: false, status: 502, message: 'LLM returned an empty response' };
  }

  return { ok: true, content };
}

export async function completeScratchpadPrompt(
  prompt: string,
  signal?: AbortSignal,
  config?: ScratchpadLLMConfig,
): Promise<ScratchpadLlmResult> {
  const resolved = resolveScratchpadLLMConfig(config);
  if (resolved.validationError) throw new Error(resolved.validationError);
  const explicitModel = config?.model?.trim() || undefined;

  // Decide chain
  let chain: readonly ScratchpadModelEntry[];
  if (!resolved.apiKey) {
    chain = explicitModel
      ? [{ id: explicitModel, webSearch: false }]
      : getScratchpadModelChain(prompt);
  } else if (resolved.provider === 'openrouter') {
    chain = resolved.model
      ? [{ id: resolved.model, webSearch: false }]
      : getScratchpadModelChain(prompt);
  } else {
    chain = [{ id: resolved.model!, webSearch: false }];
  }

  const errors: string[] = [];

  for (const entry of chain) {
    const result = await requestCompletion(entry, prompt, signal, resolved);

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
