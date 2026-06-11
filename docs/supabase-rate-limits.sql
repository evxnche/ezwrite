-- Rate limiting for the public API endpoints (agent/mcp passkey brute-force,
-- the AI proxies, link-title). A fixed-window counter keyed per IP + endpoint.
-- Called server-side via the service role from lib/rate-limit.ts (fail-open: if
-- this function is absent, the app still works — just without limiting).
--
-- Apply once in the Supabase SQL editor. Safe to re-run (idempotent).

create table if not exists public.ezwrite_rate_limits (
  bucket text primary key,                  -- "<key>:<window-index>"
  count int not null default 0,
  expires_at timestamptz not null
);

alter table public.ezwrite_rate_limits enable row level security;
-- No policies: only the service role (which bypasses RLS) touches this table.
revoke all on table public.ezwrite_rate_limits from anon, authenticated;

-- Increment the counter for the current window and report whether we're still
-- within `p_max`. SECURITY DEFINER so it runs as the table owner regardless of
-- caller. Opportunistically reaps expired rows so the table stays small without a cron.
create or replace function public.rate_limit_hit(p_key text, p_window_seconds int, p_max int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window bigint := floor(extract(epoch from now()) / p_window_seconds);
  v_bucket text := p_key || ':' || v_window::text;
  v_count int;
begin
  insert into public.ezwrite_rate_limits (bucket, count, expires_at)
    values (v_bucket, 1, now() + make_interval(secs => p_window_seconds * 2))
  on conflict (bucket)
    do update set count = public.ezwrite_rate_limits.count + 1
  returning count into v_count;

  if random() < 0.005 then
    delete from public.ezwrite_rate_limits where expires_at < now();
  end if;

  return v_count <= p_max;
end;
$$;

revoke all on function public.rate_limit_hit(text, int, int) from anon, authenticated;
