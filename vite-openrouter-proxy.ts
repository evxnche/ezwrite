import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Connect } from 'vite';
import { loadEnv } from 'vite';

function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: Record<string, unknown>) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

export function createOpenRouterProxyMiddleware(mode: string, root: string): Connect.NextHandleFunction {
  return async (req, res, next) => {
    const url = req.url ?? '';
    if (req.method !== 'POST' || !url.startsWith('/api/openrouter')) {
      next();
      return;
    }

    const apiKey = loadEnv(mode, root, '').OPENROUTER_API_KEY;
    if (!apiKey) {
      sendJson(res, 503, {
        error: 'Missing OPENROUTER_API_KEY. Add it to .env.local and restart the dev server.',
      });
      return;
    }

    try {
      const body = await readRequestBody(req);
      const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': 'http://localhost:8080',
          'X-Title': 'ezwrite',
        },
        body,
      });

      const text = await upstream.text();
      res.statusCode = upstream.status;
      res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/json');
      res.end(text);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'OpenRouter proxy failed';
      sendJson(res, 502, { error: message });
    }
  };
}
