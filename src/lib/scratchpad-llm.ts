import { getCleanLine, LIST_EXIT } from '../components/writing-helpers.ts';

export interface ScratchpadModelEntry {
  id: string;
  webSearch: boolean;
}

export type ScratchpadLLMProvider = 'openrouter' | 'groq' | 'openai-compatible' | 'anthropic' | 'opencode';

export interface ScratchpadLLMConfig {
  /**
   * API key for the provider. Sent straight from the browser to the provider —
   * except OpenCode Zen, which blocks browser requests, so its key is relayed
   * through ezwrite's same-origin proxy (forwarded verbatim, never stored).
   */
  apiKey?: string;
  /** Base URL. For anthropic leave empty to default to https://api.anthropic.com */
  baseURL?: string;
  /** Specific model id. */
  model?: string;
  /** Provider type. */
  provider?: ScratchpadLLMProvider;
}

export interface ResolvedScratchpadLLMConfig {
  provider: ScratchpadLLMProvider;
  apiKey?: string;
  baseURL?: string;
  model?: string;
  validationError?: string;
}

export const SCRATCHPAD_GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
export const SCRATCHPAD_GROQ_MODEL = 'llama-3.3-70b-versatile';
export const SCRATCHPAD_ANTHROPIC_BASE_URL = 'https://api.anthropic.com';
export const SCRATCHPAD_ANTHROPIC_MODEL = 'claude-3-5-sonnet-20241022';
export const SCRATCHPAD_OPENCODE_BASE_URL = 'https://opencode.ai/zen/v1';
// mimo-v2.5 barely "reasons" (~10 tokens) so it answers in ~2-3s. deepseek/glm
// are reasoning models that emit hundreds of hidden tokens first (10-40s) — too
// slow for a scratchpad, so they sit behind mimo as fallbacks, not the default.
export const SCRATCHPAD_OPENCODE_MODEL = 'mimo-v2.5';
export const SCRATCHPAD_OPENCODE_FREE_MODEL = 'mimo-v2.5-free';

/** With a key: fastest model first, heavier models as resilient fallbacks. */
export const SCRATCHPAD_OPENCODE_MODEL_CHAIN = [
  'mimo-v2.5',
  'deepseek-v4-flash',
  'glm-5',
  'mimo-v2.5-free',
] as const;

/** Keyless: OpenCode Zen serves its -free models without authentication. */
export const SCRATCHPAD_OPENCODE_FREE_MODEL_CHAIN = [
  'mimo-v2.5-free',
  'north-mini-code-free',
  'deepseek-v4-flash-free',
] as const;

function trimOptionalString(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * People paste the full endpoint URL from provider docs; the request code
 * appends /chat/completions itself, so strip it (and trailing slashes) here.
 */
function normalizeBaseURL(value?: string): string | undefined {
  const trimmed = trimOptionalString(value);
  if (!trimmed) return undefined;
  const normalized = trimmed.replace(/\/+$/, '').replace(/\/chat\/completions$/i, '');
  return normalized || undefined;
}

function looksLikeOpenRouterKey(apiKey?: string): boolean {
  return !!apiKey && (/^sk-or-v1-/i.test(apiKey) || /^or-/i.test(apiKey));
}

function looksLikeGroqKey(apiKey?: string): boolean {
  return !!apiKey && /^gsk_/i.test(apiKey);
}

function looksLikeAnthropicKey(apiKey?: string): boolean {
  return !!apiKey && /^sk-ant-/i.test(apiKey);
}

function inferScratchpadLLMProvider(config?: ScratchpadLLMConfig): ScratchpadLLMProvider {
  const provider = config?.provider;
  const apiKey = trimOptionalString(config?.apiKey);
  const baseURL = trimOptionalString(config?.baseURL)?.toLowerCase();

  if (provider === 'anthropic' || provider === 'groq' || provider === 'openrouter' || provider === 'opencode') return provider;

  if (baseURL?.includes('anthropic')) return 'anthropic';
  if (baseURL?.includes('api.groq.com') || baseURL?.includes('groq.com')) return 'groq';
  if (baseURL?.includes('openrouter.ai')) return 'openrouter';
  if (baseURL?.includes('opencode.ai')) return 'opencode';
  if (baseURL) return 'openai-compatible';

  if (looksLikeAnthropicKey(apiKey)) return 'anthropic';
  if (looksLikeGroqKey(apiKey)) return 'groq';
  if (looksLikeOpenRouterKey(apiKey)) return 'openrouter';

  if (provider === 'openai-compatible') return 'openai-compatible';
  return 'openrouter';
}

function sanitizeScratchpadLLMConfig(config?: ScratchpadLLMConfig): ScratchpadLLMConfig {
  const apiKey = trimOptionalString(config?.apiKey);
  const baseURL = normalizeBaseURL(config?.baseURL);
  const model = trimOptionalString(config?.model);
  const provider = inferScratchpadLLMProvider({
    provider: config?.provider,
    apiKey,
    baseURL,
    model,
  });

  return {
    ...(apiKey ? { apiKey } : {}),
    ...(baseURL ? { baseURL } : {}),
    ...(model ? { model } : {}),
    provider,
  };
}

export function resolveScratchpadLLMConfig(config?: ScratchpadLLMConfig): ResolvedScratchpadLLMConfig {
  const sanitized = sanitizeScratchpadLLMConfig(config);
  const { apiKey, provider } = sanitized;
  let { baseURL, model } = sanitized;
  let validationError: string | undefined;

  if (provider === 'anthropic') {
    baseURL ||= SCRATCHPAD_ANTHROPIC_BASE_URL;
    model ||= SCRATCHPAD_ANTHROPIC_MODEL;
  } else if (provider === 'groq') {
    baseURL ||= SCRATCHPAD_GROQ_BASE_URL;
    model ||= SCRATCHPAD_GROQ_MODEL;
  } else if (provider === 'opencode') {
    // Key optional — Zen serves -free models without one. Requests go through
    // ezwrite's same-origin proxy, so the stored base URL is informational.
    baseURL ||= SCRATCHPAD_OPENCODE_BASE_URL;
    model ||= apiKey ? SCRATCHPAD_OPENCODE_MODEL : SCRATCHPAD_OPENCODE_FREE_MODEL;
  } else if (provider === 'openai-compatible' && (apiKey || baseURL || model)) {
    if (!baseURL || !model) {
      validationError = 'Custom OpenAI-compatible providers need both a base URL and model.';
    }
  }

  return {
    provider,
    ...(apiKey ? { apiKey } : {}),
    ...(baseURL ? { baseURL } : {}),
    ...(model ? { model } : {}),
    ...(validationError ? { validationError } : {}),
  };
}

/** Default order when no live web search is needed. */
const FAST_MODEL_CHAIN: ScratchpadModelEntry[] = [
  { id: 'deepseek/deepseek-v4-flash:free', webSearch: false },
  { id: 'google/gemma-4-31b-it:free', webSearch: false },
  { id: 'z-ai/glm-4.5-air:free', webSearch: false },
  { id: 'openrouter/free', webSearch: false },
];

/** GLM + openrouter/free tolerate web search; DeepSeek/Gemma 500 with tools enabled. */
const WEB_SEARCH_MODEL_CHAIN: ScratchpadModelEntry[] = [
  { id: 'z-ai/glm-4.5-air:free', webSearch: true },
  { id: 'openrouter/free', webSearch: true },
  { id: 'google/gemma-4-31b-it:free', webSearch: false },
  { id: 'deepseek/deepseek-v4-flash:free', webSearch: false },
];

export const SCRATCHPAD_LLM_MODELS = FAST_MODEL_CHAIN.map((entry) => entry.id);

export const SCRATCHPAD_LLM_MODEL = SCRATCHPAD_LLM_MODELS[0];

export const SCRATCHPAD_WEB_SEARCH_TOOL = {
  type: 'openrouter:web_search',
  parameters: {
    engine: 'auto',
    max_results: 3,
  },
} as const;

export const SCRATCHPAD_LLM_LOADING_LINE = '…';

export function scratchpadNeedsWebSearch(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  return (
    /\b(today|yesterday|latest|current|recent|news|this week|this year|right now|202[4-9])\b/.test(lower)
    || /\b(when did|who won|how much|price of|release date|population of)\b/.test(lower)
    || /\b(how does|how do|what is|explain)\b/.test(lower)
  );
}

export function getScratchpadModelChain(prompt: string): readonly ScratchpadModelEntry[] {
  return scratchpadNeedsWebSearch(prompt) ? WEB_SEARCH_MODEL_CHAIN : FAST_MODEL_CHAIN;
}

export function buildScratchpadSystemPrompt(model: string, webSearch: boolean): string {
  const lines = [
    `ezwrite scratchpad — margin notes beside a manuscript. Model id: ${model}.`,
    'If asked what model you are, reply with only that id. Never claim to be Claude, ChatGPT, Gemini, or any vendor/product.',
    '',
    'Output (strict):',
    '• First token is the answer. No warmup.',
  ];
  if (webSearch) {
    lines.push('• Never mention searching, browsing, looking up, or tools. Search silently; only output findings.');
  }
  lines.push(
    '• No titles, headings, labels, or markdown (#, ##, **heading**).',
    '• No "I\'ll…", "Let me…", "Here\'s what I found", "Sure!", or offers to help.',
    '• No disclaimers, caveats, or "as an AI".',
    '• Plain text: tight bullets or 1–3 short sentences. Stop when done.',
    '• News/facts: lead with what happened; include dates; skip background unless essential.',
    '• Rewrites: output the revised text first, optional one-line note after.',
    '• No code unless asked.',
  );
  return lines.join('\n');
}

const LEADING_BOILERPLATE_LINE = /^(?:sure[!,.]?|okay[!,.]?|ok[!,.]?|yes[!,.]?)\s*$/i;

const LEADING_SEARCH_META = /^(?:let me|i'll|i will|i'm going to|i am going to)\b/i;

const LEADING_FINDER_PHRASE = /^here(?:'s| is) what i found\b/i;

const LEADING_MARKDOWN_HEADING = /^#{1,6}\s+\S/;

const LEADING_BOLD_TITLE = /^\*\*[^*\n]{1,120}\*\*\s*$/;

/** Strips common chatbot preambles models ignore despite instructions. */
export function stripScratchpadLlmBoilerplate(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n');

  while (lines.length > 0) {
    const line = lines[0].trim();
    if (!line) {
      lines.shift();
      continue;
    }
    if (
      LEADING_BOILERPLATE_LINE.test(line)
      || LEADING_SEARCH_META.test(line)
      || LEADING_FINDER_PHRASE.test(line)
      || LEADING_MARKDOWN_HEADING.test(line)
      || LEADING_BOLD_TITLE.test(line)
      || /^(?:i'll search|i will search|searching for|browsing for)\b/i.test(line)
    ) {
      lines.shift();
      continue;
    }
    break;
  }

  return lines.join('\n').trim();
}

export function formatScratchpadLlmReply(content: string): string {
  return stripScratchpadLlmBoilerplate(content);
}

/**
 * Returns the user prompt when the line is a scratchpad LLM invocation (`// …`).
 */
export function parseScratchpadLlmPrompt(line: string): string | null {
  const withoutListExit = line.startsWith(LIST_EXIT) ? line.slice(LIST_EXIT.length) : line;
  const visible = getCleanLine(withoutListExit);
  const match = visible.match(/^\s*\/\/(.*)$/);
  if (!match) return null;
  const prompt = match[1].trim();
  return prompt.length > 0 ? prompt : null;
}

export function isScratchpadLlmLine(line: string): boolean {
  const withoutListExit = line.startsWith(LIST_EXIT) ? line.slice(LIST_EXIT.length) : line;
  const visible = getCleanLine(withoutListExit);
  return /^\s*\/\//.test(visible);
}

export function splitScratchpadLlmResponse(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return ['(empty response)'];
  return normalized.split('\n');
}

const LLM_CONFIG_STORAGE_KEY = 'ezwrite-scratchpad-llm';
const LEGACY_OPENROUTER_KEY = 'ezwrite-openrouter-key';

/** Returns the full scratchpad LLM config (BYOK). Supports migration from old single-key storage. */
export function getScratchpadLLMConfig(): ScratchpadLLMConfig {
  try {
    const raw = localStorage.getItem(LLM_CONFIG_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? sanitizeScratchpadLLMConfig(parsed) : {};
    }

    // one-time migration from previous single OpenRouter key
    const old = localStorage.getItem(LEGACY_OPENROUTER_KEY);
    if (old && old.trim()) {
      const cfg: ScratchpadLLMConfig = sanitizeScratchpadLLMConfig({
        apiKey: old.trim(),
        provider: 'openrouter',
      });
      localStorage.setItem(LLM_CONFIG_STORAGE_KEY, JSON.stringify(cfg));
      localStorage.removeItem(LEGACY_OPENROUTER_KEY);
      return cfg;
    }
    return {};
  } catch {
    return {};
  }
}

export function setScratchpadLLMConfig(config: ScratchpadLLMConfig): void {
  try {
    const sanitized = sanitizeScratchpadLLMConfig(config);
    const hasAny = !!(
      sanitized.apiKey
      || sanitized.baseURL
      || sanitized.model
      || sanitized.provider === 'groq'
      || sanitized.provider === 'anthropic'
      || sanitized.provider === 'openai-compatible'
      || sanitized.provider === 'opencode'
    );
    if (hasAny) {
      localStorage.setItem(LLM_CONFIG_STORAGE_KEY, JSON.stringify(sanitized));
    } else {
      localStorage.removeItem(LLM_CONFIG_STORAGE_KEY);
    }
  } catch {
    /* localStorage unavailable or quota */
  }
}

export function clearScratchpadLLMConfig(): void {
  try {
    localStorage.removeItem(LLM_CONFIG_STORAGE_KEY);
  } catch {
    /* localStorage unavailable */
  }
}

/** Legacy helper — returns just the apiKey for compatibility during transition. */
export function getScratchpadOpenRouterKey(): string | null {
  return getScratchpadLLMConfig().apiKey || null;
}

export function setScratchpadOpenRouterKey(key: string): void {
  const cfg = getScratchpadLLMConfig();
  setScratchpadLLMConfig({ ...cfg, provider: 'openrouter', apiKey: key.trim() || undefined });
}

export function clearScratchpadOpenRouterKey(): void {
  const cfg = getScratchpadLLMConfig();
  if (cfg.baseURL || cfg.model) {
    setScratchpadLLMConfig({ provider: cfg.provider, baseURL: cfg.baseURL, model: cfg.model });
  } else {
    clearScratchpadLLMConfig();
  }
}
