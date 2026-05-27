create table if not exists public.ezwrite_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  sync_plan text not null default 'free' check (sync_plan in ('free', 'paid')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ezwrite_user_sync_notes (
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id text not null,
  encrypted_payload jsonb not null,
  payload_hash text not null,
  updated_at bigint not null,
  client_updated_at bigint not null,
  deleted boolean not null default false,
  inserted_at timestamptz not null default now(),
  primary key (user_id, project_id)
);

create index if not exists ezwrite_user_sync_notes_user_updated_idx
  on public.ezwrite_user_sync_notes (user_id, updated_at desc);

-- Server-authoritative updated_at (epoch ms), set on every write so cross-device
-- ordering never depends on client clocks.
create or replace function public.ezwrite_set_sync_note_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  return new;
end;
$$;

drop trigger if exists ezwrite_set_sync_note_updated_at on public.ezwrite_user_sync_notes;
create trigger ezwrite_set_sync_note_updated_at
  before insert or update on public.ezwrite_user_sync_notes
  for each row execute function public.ezwrite_set_sync_note_updated_at();

alter table public.ezwrite_profiles enable row level security;
alter table public.ezwrite_user_sync_notes enable row level security;

-- Be explicit about Data API exposure for newer Supabase projects.
-- RLS below still owner-scopes rows; these grants only make the tables reachable.
revoke all on table public.ezwrite_profiles from anon, authenticated;
revoke all on table public.ezwrite_user_sync_notes from anon, authenticated;
grant select on table public.ezwrite_profiles to authenticated;
grant select, insert, update on table public.ezwrite_user_sync_notes to authenticated;

create or replace function public.ezwrite_create_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.ezwrite_profiles (id, username)
  values (new.id, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists ezwrite_create_profile_on_signup on auth.users;
create trigger ezwrite_create_profile_on_signup
  after insert on auth.users
  for each row execute function public.ezwrite_create_profile();

drop policy if exists "users can read own ezwrite profile" on public.ezwrite_profiles;
create policy "users can read own ezwrite profile"
  on public.ezwrite_profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

-- Sync is available on every plan. Access is owner-scoped only; sync_plan does not gate it.
drop policy if exists "paid users can read own encrypted notes" on public.ezwrite_user_sync_notes;
drop policy if exists "users can read own encrypted notes" on public.ezwrite_user_sync_notes;
create policy "users can read own encrypted notes"
  on public.ezwrite_user_sync_notes
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "paid users can write own encrypted notes" on public.ezwrite_user_sync_notes;
drop policy if exists "users can insert own encrypted notes" on public.ezwrite_user_sync_notes;
create policy "users can insert own encrypted notes"
  on public.ezwrite_user_sync_notes
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "paid users can update own encrypted notes" on public.ezwrite_user_sync_notes;
drop policy if exists "users can update own encrypted notes" on public.ezwrite_user_sync_notes;
create policy "users can update own encrypted notes"
  on public.ezwrite_user_sync_notes
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Deletions are soft (set deleted = true) so other devices receive the tombstone
-- on their next pull instead of resurrecting the project. They flow through the
-- update policy above; no hard DELETE policy is granted.
--
-- REQUIRED: Supabase Auth "Confirm email" must be DISABLED — usernames map to
-- synthetic <username>@ezwrite.local addresses that cannot receive a confirmation.
--
-- sync_plan is retained for display/billing only and no longer restricts sync.
-- Future Stripe upgrade: webhook sets sync_plan = 'paid' after successful payment.
-- Keep synced note rows encrypted-only. Do not add plaintext title/body/preview columns.
