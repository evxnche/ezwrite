const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

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
