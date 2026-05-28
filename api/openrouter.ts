/**
 * Vercel serverless handler — keep self-contained (no imports outside api/)
 * so the bundle always includes upstream proxy logic.
 */
const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

export const config = {
  maxDuration: 60,
};

interface VercelRequest {
  method?: string;
  body?: unknown;
}

interface VercelResponse {
  status: (code: number) => VercelResponse;
  setHeader: (name: string, value: string) => void;
  end: (body: string) => void;
  json: (body: Record<string, unknown>) => void;
}

function getReferer(): string {
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (production) {
    return production.startsWith('http') ? production.replace(/\/$/, '') : `https://${production}`;
  }
  const preview = process.env.VERCEL_URL;
  if (preview) return `https://${preview}`;
  return 'https://ezwrite.evanche.xyz';
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

  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    res.status(503).json({
      error: 'Scratchpad AI is not configured (missing OPENROUTER_API_KEY on this deployment).',
    });
    return;
  }

  try {
    const upstream = await fetch(OPENROUTER_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': getReferer(),
        'X-Title': 'ezwrite',
      },
      body: requestBody(req),
    });

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/json');
    res.end(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OpenRouter proxy failed';
    res.status(502).json({ error: message });
  }
}
