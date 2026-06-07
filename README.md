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
4. Fill `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_LANDING_PAGE_URL` (waitlist/landing site for settings → about).
5. Open ezWrite settings, create/sign in with email + password.
6. Mark paid accounts in Supabase:
   `update public.ezwrite_profiles set sync_plan = 'paid' where email = 'demo@example.com';`
7. Paid users can toggle sync per doc. Free users stay local-only.

Supabase stores encrypted note blobs only. Account auth controls who can access rows, and the account password encrypts/decrypts note blobs in the browser.

Bug reports from settings/help save to `ezwrite_bug_reports` (message + debug context only, never note content). Read them in the Supabase table editor.
If the app says the bug-report table is missing, rerun `docs/supabase-bug-reports.sql` in the `ezwrite lp` project.

## Agent shared canvas

The hidden `//agent//` panel needs a server-backed route plus a Supabase schema. If any part is missing, passkey minting will fail.

1. Run `docs/supabase-agents.sql` in the `ezwrite lp` Supabase project.
2. Add the server-only env vars to `.env.local` or your deployment env:
   `SUPABASE_SERVICE_ROLE_KEY=...`
   `AGENT_PASSKEY_PEPPER=...`
3. Restart `npm run dev` after changing env vars, or redeploy if you are on Vercel.
4. Demo shared canvas from `npm run dev` or a deployed server build. A static preview build does not expose `/api/agent`.
5. Sign in to sync, then type `//agent//` in the editor to open the pairing window.

## Build

```bash
bun run build
```
