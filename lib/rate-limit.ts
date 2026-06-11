// Fixed-window rate limiter backed by a Supabase RPC (rate_limit_hit). No new
// infra — reuses the project's Supabase via the service role. FAIL-OPEN: any
// error (RPC missing, network, misconfig) allows the request, so the limiter can
// never take the app down. Apply docs/supabase-rate-limits.sql once to activate it.

export interface RateLimitEnv {
  supabaseUrl: string;
  serviceRoleKey: string;
}

// Best-effort client IP. Vercel sets x-real-ip to the immediate peer; x-forwarded-for
// can be client-prepended, so prefer x-real-ip and only fall back to the first XFF hop.
export function clientIp(header: (name: string) => string | undefined): string {
  const real = header('x-real-ip')?.trim();
  if (real) return real;
  const xff = header('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  return 'unknown';
}

export function rateLimitEnvFromProcess(): RateLimitEnv {
  return {
    supabaseUrl: (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '').trim(),
    serviceRoleKey: (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim(),
  };
}

function headerGetter(
  headers?: Record<string, string | string[] | undefined>,
): (name: string) => string | undefined {
  return (name) => {
    const v = headers?.[name.toLowerCase()];
    return Array.isArray(v) ? v[0] : v;
  };
}

// Convenience for Vercel handlers: returns true when the caller is OVER the limit
// for `name` (per IP), checking a per-minute cap and an optional per-day cap.
export async function endpointRateLimited(
  name: string,
  headers: Record<string, string | string[] | undefined> | undefined,
  perMinute: number,
  perDay?: number,
): Promise<boolean> {
  const env = rateLimitEnvFromProcess();
  const ip = clientIp(headerGetter(headers));
  if (!(await rateLimitAllow(env, `${name}:${ip}`, 60, perMinute))) return true;
  if (perDay && !(await rateLimitAllow(env, `${name}-day:${ip}`, 86400, perDay))) return true;
  return false;
}

// Returns true if the request is within the limit for `key` in the current window.
export async function rateLimitAllow(
  env: RateLimitEnv,
  key: string,
  windowSeconds: number,
  max: number,
): Promise<boolean> {
  if (!env.supabaseUrl || !env.serviceRoleKey) return true; // not configured -> don't block
  try {
    const res = await fetch(`${env.supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/rate_limit_hit`, {
      method: 'POST',
      headers: {
        apikey: env.serviceRoleKey,
        Authorization: `Bearer ${env.serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_key: key, p_window_seconds: windowSeconds, p_max: max }),
    });
    if (!res.ok) return true; // fail-open (e.g. migration not applied yet)
    const allowed = (await res.json()) as unknown;
    return allowed !== false;
  } catch {
    return true; // fail-open on network error
  }
}
