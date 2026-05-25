-- Run in Supabase SQL editor (after ezwrite-sync.sql).
-- Anonymous and signed-in users can submit; only service role reads rows in the dashboard.

create table if not exists public.ezwrite_bug_reports (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  contact_email text,
  user_id uuid references auth.users(id) on delete set null,
  source text not null check (source in ('help', 'settings')),
  debug_context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ezwrite_bug_reports_created_idx
  on public.ezwrite_bug_reports (created_at desc);

alter table public.ezwrite_bug_reports enable row level security;

-- Be explicit about Data API exposure for newer Supabase projects.
revoke all on table public.ezwrite_bug_reports from anon, authenticated;
grant insert on table public.ezwrite_bug_reports to anon, authenticated;

drop policy if exists "anyone can submit bug reports" on public.ezwrite_bug_reports;
create policy "anyone can submit bug reports"
  on public.ezwrite_bug_reports
  for insert
  to anon, authenticated
  with check (
    char_length(trim(message)) >= 10
    and char_length(message) <= 4000
    and (contact_email is null or char_length(contact_email) <= 320)
    and source in ('help', 'settings')
  );

-- No select/update/delete policies for anon/authenticated → read reports in Supabase dashboard only.
