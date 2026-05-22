create table if not exists public.ezwrite_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
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
  inserted_at timestamptz not null default now(),
  primary key (user_id, project_id)
);

create index if not exists ezwrite_user_sync_notes_user_updated_idx
  on public.ezwrite_user_sync_notes (user_id, updated_at desc);

alter table public.ezwrite_profiles enable row level security;
alter table public.ezwrite_user_sync_notes enable row level security;

create or replace function public.ezwrite_create_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.ezwrite_profiles (id, email)
  values (new.id, new.email)
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

drop policy if exists "paid users can read own encrypted notes" on public.ezwrite_user_sync_notes;
create policy "paid users can read own encrypted notes"
  on public.ezwrite_user_sync_notes
  for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.ezwrite_profiles
      where id = (select auth.uid()) and sync_plan = 'paid'
    )
  );

drop policy if exists "paid users can write own encrypted notes" on public.ezwrite_user_sync_notes;
create policy "paid users can write own encrypted notes"
  on public.ezwrite_user_sync_notes
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.ezwrite_profiles
      where id = (select auth.uid()) and sync_plan = 'paid'
    )
  );

drop policy if exists "paid users can update own encrypted notes" on public.ezwrite_user_sync_notes;
create policy "paid users can update own encrypted notes"
  on public.ezwrite_user_sync_notes
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.ezwrite_profiles
      where id = (select auth.uid()) and sync_plan = 'paid'
    )
  );

-- Demo/manual paid upgrade:
-- update public.ezwrite_profiles set sync_plan = 'paid' where email = 'demo@example.com';
--
-- Future Stripe upgrade:
-- Stripe webhook should set sync_plan = 'paid' after successful payment.
--
-- Keep synced note rows encrypted-only. Do not add plaintext title/body/preview columns.
