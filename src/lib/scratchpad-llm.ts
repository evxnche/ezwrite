import { getCleanLine, LIST_EXIT } from '../components/writing-helpers.ts';

export interface ScratchpadModelEntry {
  id: string;
  webSearch: boolean;
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
