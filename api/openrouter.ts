import { getOpenRouterReferer, proxyOpenRouterChatCompletion } from '../lib/openrouter-upstream';

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    res.status(503).json({
      error: 'Scratchpad AI is not configured on this deployment (missing OPENROUTER_API_KEY).',
    });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
    const upstream = await proxyOpenRouterChatCompletion(body, apiKey, getOpenRouterReferer());
    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/json');
    res.end(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OpenRouter proxy failed';
    res.status(502).json({ error: message });
  }
}
