// Closed-beta access gate. A code is validated server-side by the Supabase
// `redeem_beta_code` RPC (codes live in a table, never in this bundle), and a
// local grant flag is stored so testers don't re-enter the code on every visit.
// This is real per-tester gating: revoking a code in Supabase locks that tester
// out on their next reload.
const ENV = import.meta.env as Record<string, string | undefined> | undefined;
const SUPABASE_URL = ENV?.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = ENV?.VITE_SUPABASE_ANON_KEY;

const STORAGE_KEY = 'ezwrite-beta-access';
const GRANTED = 'granted';

export function shouldBypassBetaAccess(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

export function hasBetaAccess(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === GRANTED;
  } catch {
    return false;
  }
}

function grantBetaAccess(): void {
  try {
    localStorage.setItem(STORAGE_KEY, GRANTED);
  } catch {
    // best-effort; gate still unlocks for this session even if storage fails
  }
}

// Flat (not discriminated) on purpose: this project compiles with strictNullChecks
// off, where TS won't narrow a discriminated union, so callers can always read .error.
export interface RedeemResult {
  ok: boolean;
  error?: string;
}

export async function redeemBetaCode(code: string): Promise<RedeemResult> {
  const trimmed = code.trim();
  if (!trimmed) return { ok: false, error: 'enter your access code' };
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { ok: false, error: 'access is not configured yet — contact evan' };
  }

  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/redeem_beta_code`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_code: trimmed }),
    });
  } catch {
    return { ok: false, error: 'network error — check your connection' };
  }

  if (!res.ok) {
    return { ok: false, error: 'something went wrong — try again' };
  }

  const valid = await res.json().catch(() => false);
  if (valid === true) {
    grantBetaAccess();
    return { ok: true };
  }
  return { ok: false, error: 'that code isn’t valid' };
}
