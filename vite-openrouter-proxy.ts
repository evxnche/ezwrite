import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Connect } from 'vite';
import { loadEnv } from 'vite';
import { proxyOpenRouterChatCompletion } from './lib/openrouter-upstream';

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
    
    if (req.method === 'GET' && url.startsWith('/api/link-title')) {
      const urlObj = new URL(url, 'http://localhost');
      const targetUrl = urlObj.searchParams.get('url');
      if (!targetUrl) {
        sendJson(res, 400, { error: 'Missing url parameter' });
        return;
      }
      try {
        const upstream = await fetch(targetUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        });
        if (!upstream.ok) {
          sendJson(res, upstream.status, { error: 'Failed to fetch url' });
          return;
        }
        const html = await upstream.text();
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        let title = titleMatch ? titleMatch[1].trim() : targetUrl;
        title = title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'");
        sendJson(res, 200, { title });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Fetch failed';
        sendJson(res, 502, { error: message });
      }
      return;
    }

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
      const upstream = await proxyOpenRouterChatCompletion(body, apiKey, 'http://localhost:8080');
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
