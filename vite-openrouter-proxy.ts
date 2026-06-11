import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Connect } from 'vite';
import { loadEnv } from 'vite';
import { proxyOpenRouterChatCompletion, validateScratchpadProxyBody } from './lib/openrouter-upstream';
import { handleAgentRequest } from './lib/agent-upstream';

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

    if (url.startsWith('/api/agent')) {
      const env = loadEnv(mode, root, '');
      const agentEnv = {
        supabaseUrl: env.SUPABASE_URL || env.VITE_SUPABASE_URL || '',
        serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY || '',
        anonKey: env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '',
        passkeyPepper: env.AGENT_PASSKEY_PEPPER || '',
      };
      const method = req.method ?? 'GET';
      const body = method === 'POST' ? await readRequestBody(req) : '';
      const header = (name: string): string | undefined => {
        const value = req.headers[name.toLowerCase()];
        return Array.isArray(value) ? value[0] : value;
      };
      try {
        const result = await handleAgentRequest({ method, header, body }, agentEnv);
        sendJson(res, result.status, result.body);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Agent request failed';
        sendJson(res, 500, { error: message });
      }
      return;
    }

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
      const validation = validateScratchpadProxyBody(await readRequestBody(req));
      if (!validation.ok) {
        sendJson(res, validation.status ?? 400, { error: validation.error ?? 'Bad request' });
        return;
      }
      const upstream = await proxyOpenRouterChatCompletion(validation.body!, apiKey, 'http://localhost:8080');
      const text = await upstream.text();
      if (!upstream.ok) {
        sendJson(res, upstream.status, { error: `Scratchpad AI request failed (${upstream.status}).` });
        return;
      }
      res.statusCode = upstream.status;
      res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/json');
      res.end(text);
    } catch {
      sendJson(res, 502, { error: 'Scratchpad AI proxy failed.' });
    }
  };
}
