-- Agent-friendly shared canvas: passkey pairings + relay queue + canvas snapshots.
--
-- This powers letting an external AI agent (Poke, Claude Code, Codex, etc.) write
-- into a user's canvas. The user mints a short passkey; the agent presents it to
-- /api/agent instead of username/password. Agent writes land in ezwrite_agent_events
-- and are applied LIVE by the user's open browser tab, which also publishes the
-- current canvas back into ezwrite_agent_canvas so agents can read/list.
--
-- SECURITY TRADE-OFF: unlike ezwrite_user_sync_notes (end-to-end encrypted), the
-- relay rows here hold PLAINTEXT for paired projects — the agent holds only a
-- passkey, never the user's master key. This is opt-in, scoped, and revocable.
-- Inserts/lookups that need the passkey pepper run server-side via the service role.

-- 1) Pairings: a hashed passkey mapped to a user + scope.
create table if not exists public.ezwrite_agent_pairings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  passkey_hash text not null unique,        -- HMAC-SHA256(server pepper, passkey)
  label text,                               -- e.g. "Poke", "Claude Code"
  target_project_id text,                   -- null = any project; set = single-project scope
  can_manage_projects boolean not null default false,
  revoked boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz,                   -- null = no expiry
  last_used_at timestamptz
);

create index if not exists ezwrite_agent_pairings_user_idx
  on public.ezwrite_agent_pairings (user_id, created_at desc);

-- 2) Events: agent -> canvas command queue. The browser drains and marks consumed.
create table if not exists public.ezwrite_agent_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  pairing_id uuid not null references public.ezwrite_agent_pairings(id) on delete cascade,
  op jsonb not null,                        -- { type, projectId?, text?, ... }
  consumed boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists ezwrite_agent_events_user_pending_idx
  on public.ezwrite_agent_events (user_id, consumed, id);

-- 3) Canvas snapshots: canvas -> agent, so reads/lists work for any project.
create table if not exists public.ezwrite_agent_canvas (
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id text not null,
  title text,
  pages jsonb not null,                     -- string[] of page contents
  updated_at timestamptz not null default now(),
  primary key (user_id, project_id)
);

alter table public.ezwrite_agent_pairings enable row level security;
alter table public.ezwrite_agent_events enable row level security;
alter table public.ezwrite_agent_canvas enable row level security;

-- Data API exposure. RLS below owner-scopes every row; these grants only make the
-- tables reachable for the signed-in browser. The agent never authenticates here —
-- it talks to /api/agent, which uses the service role (bypasses RLS).
revoke all on table public.ezwrite_agent_pairings from anon, authenticated;
revoke all on table public.ezwrite_agent_events from anon, authenticated;
revoke all on table public.ezwrite_agent_canvas from anon, authenticated;
-- Pairings are minted server-side (needs the pepper); the browser only reads + revokes.
grant select, update on table public.ezwrite_agent_pairings to authenticated;
-- Events are inserted server-side; the browser reads them and marks them consumed.
grant select, update on table public.ezwrite_agent_events to authenticated;
-- Snapshots are published by the browser and read server-side for agents.
grant select, insert, update, delete on table public.ezwrite_agent_canvas to authenticated;

-- Pairings: owner may read and revoke (update). No client insert — minting is server-side.
drop policy if exists "users read own agent pairings" on public.ezwrite_agent_pairings;
create policy "users read own agent pairings"
  on public.ezwrite_agent_pairings
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "users revoke own agent pairings" on public.ezwrite_agent_pairings;
create policy "users revoke own agent pairings"
  on public.ezwrite_agent_pairings
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Events: owner may read their queue and mark rows consumed. No client insert.
drop policy if exists "users read own agent events" on public.ezwrite_agent_events;
create policy "users read own agent events"
  on public.ezwrite_agent_events
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "users consume own agent events" on public.ezwrite_agent_events;
create policy "users consume own agent events"
  on public.ezwrite_agent_events
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Canvas snapshots: owner may publish (insert/update), read, and clear their own.
drop policy if exists "users read own agent canvas" on public.ezwrite_agent_canvas;
create policy "users read own agent canvas"
  on public.ezwrite_agent_canvas
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "users insert own agent canvas" on public.ezwrite_agent_canvas;
create policy "users insert own agent canvas"
  on public.ezwrite_agent_canvas
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "users update own agent canvas" on public.ezwrite_agent_canvas;
create policy "users update own agent canvas"
  on public.ezwrite_agent_canvas
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "users delete own agent canvas" on public.ezwrite_agent_canvas;
create policy "users delete own agent canvas"
  on public.ezwrite_agent_canvas
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- NOTE: /api/agent requires SUPABASE_SERVICE_ROLE_KEY and AGENT_PASSKEY_PEPPER as
-- server-only env vars. The service role bypasses RLS to mint pairings, enqueue
-- events, and read snapshots on the agent's behalf.
