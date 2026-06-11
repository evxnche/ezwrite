const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

// --- abuse guards ----------------------------------------------------------
// This proxy spends ezwrite's own OPENROUTER_API_KEY, so it must only ever serve
// the FREE models the scratchpad falls back to. Restricting to free models means
// an anonymous caller can't pick an expensive model and bill us — the proxy has no
// monetary cost surface even without auth. Anyone wanting paid models brings their
// own key (handled client-side, never through here).
const MAX_PROXY_BODY_BYTES = 200_000; // ~200 KB request cap
const MAX_PROXY_OUTPUT_TOKENS = 4096;

const FREE_MODEL_ALLOWLIST = new Set([
  'deepseek/deepseek-v4-flash:free',
  'google/gemma-4-31b-it:free',
  'z-ai/glm-4.5-air:free',
  'openrouter/free',
]);

function isFreeModel(model: unknown): boolean {
  return typeof model === 'string' && (FREE_MODEL_ALLOWLIST.has(model) || /:free$/i.test(model));
}

export interface ProxyValidation {
  ok: boolean;
  status?: number;
  error?: string;
  body?: string; // sanitized/clamped body to forward upstream
}

// Validate + sanitize an inbound scratchpad proxy body. Rejects oversized bodies,
// non-free models, and clamps max_tokens. Returns the body to forward on success.
export function validateScratchpadProxyBody(raw: string): ProxyValidation {
  if (raw.length > MAX_PROXY_BODY_BYTES) return { ok: false, status: 413, error: 'Request too large.' };
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { ok: false, status: 400, error: 'Invalid JSON body.' };
  }
  if (!isFreeModel(parsed.model)) {
    return { ok: false, status: 403, error: 'This endpoint only serves ezwrite free models. Use your own API key in settings for other models.' };
  }
  const mt = parsed.max_tokens;
  if (typeof mt !== 'number' || !Number.isFinite(mt) || mt <= 0 || mt > MAX_PROXY_OUTPUT_TOKENS) {
    parsed.max_tokens = MAX_PROXY_OUTPUT_TOKENS;
  }
  return { ok: true, body: JSON.stringify(parsed) };
}

export function getOpenRouterReferer(): string {
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  const landing = process.env.VITE_LANDING_PAGE_URL;
  if (landing) return landing.replace(/\/$/, '');
  return 'https://ezwrite.evanche.xyz';
}

export async function proxyOpenRouterChatCompletion(
  body: string,
  apiKey: string,
  referer = getOpenRouterReferer(),
): Promise<Response> {
  return fetch(OPENROUTER_CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': referer,
      'X-Title': 'ezwrite',
    },
    body,
  });
}
