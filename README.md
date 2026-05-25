# ezwrite

a minimal, distraction-free writing tool because i like paper and pen.

## Dev

```bash
bun install
bun run dev
```

## Encrypted sync

1. Run `docs/supabase-sync.sql` in Supabase SQL editor.
2. Run `docs/supabase-bug-reports.sql` for in-app bug reports.
3. Copy `.env.example` to `.env.local`.
4. Fill `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
5. Open ezWrite settings, create/sign in with email + password.
6. Mark paid accounts in Supabase:
   `update public.ezwrite_profiles set sync_plan = 'paid' where email = 'demo@example.com';`
7. Paid users can toggle sync per doc. Free users stay local-only.

Supabase stores encrypted note blobs only. Account auth controls who can access rows, and the account password encrypts/decrypts note blobs in the browser.

Bug reports from settings/help save to `ezwrite_bug_reports` (message + debug context only, never note content). Read them in the Supabase table editor.

## Build

```bash
bun run build
```
