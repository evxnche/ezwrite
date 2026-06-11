const OPENCODE_ZEN_CHAT_URL = 'https://opencode.ai/zen/v1/chat/completions';

// --- abuse guards ----------------------------------------------------------
// OpenCode Zen blocks browser (CORS) requests, so BYOK keys are relayed through
// this same-origin proxy. The key belongs to the caller and is forwarded
// verbatim, never stored or logged — there is no ezwrite cost surface.
// Keyless calls are allowed only for Zen's -free models so the endpoint can't
// be used as an anonymous relay toward paid models.
const MAX_PROXY_BODY_BYTES = 200_000; // ~200 KB request cap
const MAX_PROXY_OUTPUT_TOKENS = 4096;

function isFreeZenModel(model: unknown): boolean {
  return typeof model === 'string' && /-free$/i.test(model);
}

export interface OpencodeProxyValidation {
  ok: boolean;
  status?: number;
  error?: string;
  body?: string; // sanitized/clamped body to forward upstream
}

// Validate + sanitize an inbound opencode proxy body. Rejects oversized bodies
// and keyless calls to non-free models, and clamps max_tokens.
export function validateOpencodeProxyBody(raw: string, hasApiKey: boolean): OpencodeProxyValidation {
  if (raw.length > MAX_PROXY_BODY_BYTES) return { ok: false, status: 413, error: 'Request too large.' };
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { ok: false, status: 400, error: 'Invalid JSON body.' };
  }
  if (typeof parsed.model !== 'string' || !parsed.model.trim()) {
    return { ok: false, status: 400, error: 'Missing model.' };
  }
  if (!hasApiKey && !isFreeZenModel(parsed.model)) {
    return { ok: false, status: 403, error: 'This model needs an OpenCode Zen API key. Add one in settings, or leave the model blank to use free models.' };
  }
  const mt = parsed.max_tokens;
  if (typeof mt !== 'number' || !Number.isFinite(mt) || mt <= 0 || mt > MAX_PROXY_OUTPUT_TOKENS) {
    parsed.max_tokens = MAX_PROXY_OUTPUT_TOKENS;
  }
  return { ok: true, body: JSON.stringify(parsed) };
}

export function proxyOpencodeChatCompletion(body: string, apiKey?: string): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  return fetch(OPENCODE_ZEN_CHAT_URL, {
    method: 'POST',
    headers,
    body,
  });
}
