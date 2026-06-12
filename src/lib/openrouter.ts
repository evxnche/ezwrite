import {
  buildScratchpadSystemPrompt,
  formatScratchpadLlmReply,
  getScratchpadModelChain,
  resolveScratchpadLLMConfig,
  scratchpadNeedsLiveData,
  SCRATCHPAD_OPENCODE_FREE_MODEL_CHAIN,
  SCRATCHPAD_OPENCODE_MODEL_CHAIN,
  SCRATCHPAD_WEB_SEARCH_TOOL,
  type ResolvedScratchpadLLMConfig,
  type ScratchpadLLMConfig,
  type ScratchpadModelEntry,
} from './scratchpad-llm.ts';

const OPENROUTER_CHAT_PATH = '/api/openrouter';
const OPENCODE_CHAT_PATH = '/api/opencode';
const OPENROUTER_DIRECT_URL = 'https://openrouter.ai/api/v1/chat/completions';

type OpencodeGateway = 'zen' | 'go';

/**
 * OpenCode runs two gateways (Zen and Go) with separate keys, and a pasted key
 * doesn't say which it belongs to. Remember which one accepted it this session
 * so only the first request pays for the discovery round trip.
 */
let opencodeGatewayHint: OpencodeGateway | undefined;

export interface ScratchpadLlmResult {
  text: string;
  model: string;
}

interface OpenRouterMessage {
  role: string;
  content?: string | null;
  reasoning?: string;
  /** OpenCode Zen reasoning models put their thinking here. */
  reasoning_content?: string;
}

interface OpenRouterChoice {
  message?: OpenRouterMessage;
  finish_reason?: string;
}

// OpenCode's models are reasoning models: they spend hundreds of tokens
// "thinking" (reasoning_content) before emitting any answer. A 700-token cap
// gets consumed entirely by reasoning, leaving content empty and the reply
// truncated mid-thought — so they get a generous ceiling. It's a ceiling, not
// a target; the model stops (finish_reason "stop") once it has answered.
const OPENCODE_MAX_TOKENS = 4000;

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

export function extractAssistantContent(choice?: OpenRouterChoice): string {
  const message = choice?.message;
  const content = message?.content?.trim();
  if (content) return content;
  // Reasoning models sometimes leave content empty. If the reply was cut off by
  // the token limit (finish_reason "length"), the reasoning is an unfinished
  // mid-thought — never surface that. Only fall back to reasoning when the model
  // actually finished, where the last line tends to hold the answer.
  if (choice?.finish_reason === 'length') return '';
  const reasoning = message?.reasoning?.trim() || message?.reasoning_content?.trim();
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

  // OpenAI-compatible / OpenRouter / OpenCode path
  const usingOpenRouter = config?.provider === 'openrouter';
  // OpenCode blocks browser requests (no CORS), so it always goes through
  // ezwrite's same-origin relay — with or without a key.
  const isOpencode = config?.provider === 'opencode';
  const isDirect = !!apiKey && !isOpencode;

  const body: Record<string, unknown> = {
    model: entry.id,
    messages: [
      { role: 'system', content: buildScratchpadSystemPrompt(entry.id, entry.webSearch) },
      { role: 'user', content: prompt },
    ],
    max_tokens: isOpencode ? OPENCODE_MAX_TOKENS : entry.webSearch ? 500 : 700,
  };

  if (entry.webSearch && usingOpenRouter) {
    body.tools = [SCRATCHPAD_WEB_SEARCH_TOOL];
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (isOpencode && apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
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

  if (isOpencode) {
    const sendViaRelay = async (gateway: OpencodeGateway): Promise<
      { ok: true; content: string } | { ok: false; status: number; message: string; badKey?: boolean }
    > => {
      let relayRes: Response;
      try {
        relayRes = await fetch(OPENCODE_CHAT_PATH, {
          method: 'POST',
          headers,
          body: JSON.stringify({ ...body, gateway }),
          signal,
        });
      } catch (error) {
        if (signal?.aborted) throw error;
        return { ok: false, status: 503, message: error instanceof Error ? error.message : 'Network error' };
      }
      const relayPayload = await relayRes.json().catch(() => ({})) as OpenRouterChatResponse;
      if (!relayRes.ok) {
        const message = relayPayload.error?.message ?? `LLM request failed (${relayRes.status})`;
        if (/not supported/i.test(relayPayload.error?.message ?? '')) {
          // Unknown model id on this gateway — 404 lets the chain fall through.
          return { ok: false, status: 404, message };
        }
        if (relayRes.status === 404 && !relayPayload.error) {
          return { ok: false, status: 404, message: 'OpenCode relay missing on this host (deploy api/opencode).' };
        }
        const badKey = !!apiKey && (relayRes.status === 401 || relayRes.status === 403);
        return { ok: false, status: relayRes.status, message, badKey };
      }
      const relayContent = extractAssistantContent(relayPayload.choices?.[0]);
      if (!relayContent) {
        // 502 is retriable, so an empty/truncated reply falls through to the next model in the chain.
        return { ok: false, status: 502, message: 'LLM returned an empty response' };
      }
      return { ok: true, content: relayContent };
    };

    // Keyless requests only work on Zen (its -free models need no auth). With
    // a key, start from the gateway the base URL or session hint points at, and
    // on an auth failure try the other one — the key tells us which it is.
    const preferred: OpencodeGateway = !apiKey
      ? 'zen'
      : config?.baseURL?.includes('/zen/go')
        ? 'go'
        : opencodeGatewayHint ?? 'zen';
    const result = await sendViaRelay(preferred);
    if (result.ok) {
      if (apiKey) opencodeGatewayHint = preferred;
      return result;
    }
    if (!apiKey || !result.badKey) return result;
    const fallback: OpencodeGateway = preferred === 'go' ? 'zen' : 'go';
    const retry = await sendViaRelay(fallback);
    if (retry.ok) {
      opencodeGatewayHint = fallback;
      return retry;
    }
    if (retry.badKey) {
      return { ok: false, status: 401, message: 'Invalid OpenCode API key — rejected by both the Zen and Go gateways (401/403). Check or clear it in settings.' };
    }
    return retry;
  }

  let targetURL: string;
  if (!isDirect) {
    targetURL = OPENROUTER_CHAT_PATH;
  } else if (usingOpenRouter) {
    targetURL = OPENROUTER_DIRECT_URL;
  } else {
    const base = config!.baseURL!.trim().replace(/\/+$/, '');
    targetURL = `${base}/chat/completions`;
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
    let message = error instanceof Error ? error.message : 'Network error';
    if (isDirect && config?.provider === 'openai-compatible' && /failed to fetch|load failed|networkerror/i.test(message)) {
      message = 'The provider blocked this browser request (no CORS) or is unreachable. Check the base URL, or pick OpenCode Zen, OpenRouter, or Groq in settings instead.';
    }
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

  const content = extractAssistantContent(payload.choices?.[0]);
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

  // OpenCode's models can't browse, so a real-time question ("latest X",
  // "who won…") would answer from stale training data. Auto-route just those
  // through ezwrite's free OpenRouter web-search chain — keeping OpenCode for
  // everything else — so live answers work without changing any settings.
  // Best-effort: if the web path is unavailable, fall through to OpenCode.
  if (resolved.provider === 'opencode' && scratchpadNeedsLiveData(prompt)) {
    for (const entry of getScratchpadModelChain(prompt)) {
      const webResult = await requestCompletion(entry, prompt, signal, { provider: 'openrouter' });
      if (webResult.ok) {
        return { text: formatScratchpadLlmReply(webResult.content), model: entry.id };
      }
    }
  }

  // Decide chain
  let chain: readonly ScratchpadModelEntry[];
  if (resolved.provider === 'opencode') {
    // Explicit model first; defaults behind it so an unknown/renamed Zen model
    // id falls back instead of dead-ending. Keyless keys to free models only.
    const defaults = resolved.apiKey ? SCRATCHPAD_OPENCODE_MODEL_CHAIN : SCRATCHPAD_OPENCODE_FREE_MODEL_CHAIN;
    const ids = [...new Set([...(resolved.model ? [resolved.model] : []), ...defaults])];
    chain = ids.map((id) => ({ id, webSearch: false }));
  } else if (!resolved.apiKey) {
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
