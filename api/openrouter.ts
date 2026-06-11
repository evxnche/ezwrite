/**
 * Vercel serverless handler for the scratchpad's free-model fallback. Spends
 * ezwrite's own OPENROUTER_API_KEY, so it is restricted to free models and clamped
 * (see validateScratchpadProxyBody) — an anonymous caller can't run up a bill.
 * Shares validation + upstream call with the dev proxy via lib/openrouter-upstream.
 */
import { validateScratchpadProxyBody, proxyOpenRouterChatCompletion } from '../lib/openrouter-upstream.js';
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (await endpointRateLimited('openrouter', req.headers, 20, 400)) {
    res.status(429).json({ error: 'Too many requests. Slow down and retry shortly.' });
    return;
  }

  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    res.status(503).json({
      error: 'Scratchpad AI is not configured (missing OPENROUTER_API_KEY on this deployment).',
    });
    return;
  }

  const validation = validateScratchpadProxyBody(requestBody(req));
  if (!validation.ok) {
    res.status(validation.status ?? 400).json({ error: validation.error ?? 'Bad request' });
    return;
  }

  try {
    const upstream = await proxyOpenRouterChatCompletion(validation.body!, apiKey);
    const text = await upstream.text();
    if (!upstream.ok) {
      // Don't reflect the upstream error body — it can leak our OpenRouter account id.
      res.status(upstream.status).json({ error: `Scratchpad AI request failed (${upstream.status}).` });
      return;
    }
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/json');
    res.end(text);
  } catch {
    res.status(502).json({ error: 'Scratchpad AI proxy failed.' });
  }
}
