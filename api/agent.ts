import { handleAgentRequest, type AgentEnv } from '../lib/agent-upstream.js';
import { rateLimitAllow, clientIp } from '../lib/rate-limit.js';

export const config = {
  maxDuration: 30,
};

interface VercelRequest {
  method?: string;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
}

interface VercelResponse {
  status: (code: number) => VercelResponse;
  setHeader: (name: string, value: string) => void;
  json: (body: Record<string, unknown>) => void;
}

function readEnv(): AgentEnv {
  return {
    supabaseUrl: (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '').trim(),
    serviceRoleKey: (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim(),
    anonKey: (process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? '').trim(),
    passkeyPepper: (process.env.AGENT_PASSKEY_PEPPER ?? '').trim(),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const header = (name: string): string | undefined => {
    const value = req.headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
  };
  try {
    const result = await handleAgentRequest(
      { method: req.method ?? 'GET', header, body: req.body },
      readEnv(),
      { rateLimitAllow, clientIp },
    );
    res.status(result.status).json(result.body);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Agent request failed';
    res.status(500).json({ error: message });
  }
}
