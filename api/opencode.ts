/**
 * Vercel serverless relay for OpenCode Zen BYOK. Zen blocks browser (CORS)
 * requests, so the scratchpad sends them here and this handler forwards them
 * same-origin → opencode.ai. The caller's API key is passed through verbatim
 * and never stored or logged. Keyless requests are restricted to Zen's -free
 * models (see validateOpencodeProxyBody).
 */
import { validateOpencodeProxyBody, proxyOpencodeChatCompletion } from '../lib/opencode-upstream.js';
import { endpointRateLimited } from '../lib/rate-limit.js';

export const config = {
  maxDuration: 60,
};

interface VercelRequest {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
}

interface VercelResponse {
  status: (code: number) => VercelResponse;
  setHeader: (name: string, value: string) => void;
  end: (body: string) => void;
  json: (body: Record<string, unknown>) => void;
}

function requestBody(req: VercelRequest): string {
  if (typeof req.body === 'string') return req.body;
  if (req.body === undefined || req.body === null) return '{}';
  return JSON.stringify(req.body);
}

function bearerKey(req: VercelRequest): string | undefined {
  const raw = req.headers?.authorization;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const match = value?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || undefined;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (await endpointRateLimited('opencode', req.headers, 20, 400)) {
    res.status(429).json({ error: 'Too many requests. Slow down and retry shortly.' });
    return;
  }

  const apiKey = bearerKey(req);
  const validation = validateOpencodeProxyBody(requestBody(req), !!apiKey);
  if (!validation.ok) {
    res.status(validation.status ?? 400).json({ error: validation.error ?? 'Bad request' });
    return;
  }

  try {
    const upstream = await proxyOpencodeChatCompletion(validation.body!, apiKey, validation.gateway);
    // Pass upstream errors through — they describe the caller's own key/model,
    // nothing of ezwrite's leaks here.
    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/json');
    res.end(text);
  } catch {
    res.status(502).json({ error: 'OpenCode Zen proxy failed.' });
  }
}
