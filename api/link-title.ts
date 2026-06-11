import { lookup } from 'node:dns/promises';
import { isBlockedIp } from '../lib/ssrf-guard.js';
import { endpointRateLimited } from '../lib/rate-limit.js';

export const config = {
  maxDuration: 10,
};

const FETCH_TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 256 * 1024; // titles live in <head>; 256 KB is plenty

interface VercelRequest {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
  headers?: Record<string, string | string[] | undefined>;
}

interface VercelResponse {
  status: (code: number) => VercelResponse;
  json: (body: Record<string, unknown>) => void;
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.length; }
  return out;
}

// Read at most maxBytes from a response body, then stop.
async function readCapped(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.length;
      if (total >= maxBytes) {
        await reader.cancel().catch(() => {});
        break;
      }
    }
  }
  return new TextDecoder('utf-8').decode(concat(chunks).slice(0, maxBytes));
}

// Reject http(s)-only and any host that resolves into a private/loopback/metadata
// range. Returns an error message, or null when the URL is safe to fetch.
async function blockUrl(parsed: URL): Promise<string | null> {
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return 'Only http(s) URLs are allowed';
  try {
    const addrs = await lookup(parsed.hostname, { all: true });
    if (addrs.length === 0 || addrs.some((a) => isBlockedIp(a.address))) return 'URL host is not allowed';
  } catch {
    return 'Could not resolve url host';
  }
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (await endpointRateLimited('link-title', req.headers, 40)) {
    res.status(429).json({ error: 'Too many requests. Slow down and retry shortly.' });
    return;
  }

  const url = req.query?.url;
  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'Missing or invalid url parameter' });
    return;
  }

  let current: URL;
  try {
    current = new URL(url);
  } catch {
    res.status(400).json({ error: 'Invalid url' });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    // Follow redirects manually, re-validating every hop — otherwise a public URL
    // could 302 to an internal host and bypass the SSRF check.
    let upstream: Response | null = null;
    for (let hop = 0; hop < 4; hop++) {
      const blocked = await blockUrl(current);
      if (blocked) {
        res.status(400).json({ error: blocked });
        return;
      }
      const r = await fetch(current.toString(), {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ezwrite-link-preview/1.0)',
          Accept: 'text/html,application/xhtml+xml',
        },
      });
      const location = r.status >= 300 && r.status < 400 ? r.headers.get('location') : null;
      if (location) {
        try {
          current = new URL(location, current);
        } catch {
          res.status(502).json({ error: 'Bad redirect' });
          return;
        }
        continue;
      }
      upstream = r;
      break;
    }
    if (!upstream) {
      res.status(502).json({ error: 'Too many redirects' });
      return;
    }
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: 'Failed to fetch url' });
      return;
    }

    const html = await readCapped(upstream, MAX_HTML_BYTES);
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    let title = titleMatch ? titleMatch[1].trim() : url;
    title = title
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'");

    res.status(200).json({ title });
  } catch {
    res.status(502).json({ error: 'Fetch failed' });
  } finally {
    clearTimeout(timer);
  }
}
