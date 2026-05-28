import { getCleanLine, LIST_EXIT } from '../components/writing-helpers.ts';

/** One try each, in order — no intent routing. */
export const SCRATCHPAD_LLM_MODELS = [
  'deepseek/deepseek-v4-flash:free',
  'google/gemma-4-31b-it:free',
  'z-ai/glm-4.5-air:free',
  'openrouter/free',
] as const;

export const SCRATCHPAD_LLM_MODEL = SCRATCHPAD_LLM_MODELS[0];

export const SCRATCHPAD_WEB_SEARCH_TOOL = {
  type: 'openrouter:web_search',
  parameters: {
    engine: 'auto',
    max_results: 5,
  },
} as const;

export const SCRATCHPAD_LLM_LOADING_LINE = '…';

export function buildScratchpadSystemPrompt(model: string): string {
  return [
    `ezwrite scratchpad — margin notes beside a manuscript. Model id: ${model}.`,
    'If asked what model you are, reply with only that id. Never claim to be Claude, ChatGPT, Gemini, or any vendor/product.',
    '',
    'Output (strict):',
    '• First token is the answer. No warmup.',
    '• Never mention searching, browsing, looking up, or tools. Search silently when needed; only output findings.',
    '• No titles, headings, labels, or markdown (#, ##, **heading**).',
    '• No "I\'ll…", "Let me…", "Here\'s what I found", "Sure!", or offers to help.',
    '• No disclaimers, caveats, or "as an AI".',
    '• Plain text: tight bullets or 1–3 short sentences. Stop when done.',
    '• News/facts: lead with what happened; include dates; skip background unless essential.',
    '• Rewrites: output the revised text first, optional one-line note after.',
    '• No code unless asked.',
  ].join('\n');
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
