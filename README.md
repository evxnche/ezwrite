# ezwrite

a minimal, distraction-free writing tool because i like paper and pen.

## Dev

```bash
bun install
bun run dev
```

## Encrypted sync

1. Run `docs/supabase-sync.sql` in Supabase SQL editor.
2. Copy `.env.example` to `.env.local`.
3. Fill `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Open ezWrite settings, create/sign in with email + password.
5. Mark paid accounts in Supabase:
   `update public.ezwrite_profiles set sync_plan = 'paid' where email = 'demo@example.com';`
6. Paid users can toggle sync per doc. Free users stay local-only.

Supabase stores encrypted note blobs only. Account auth controls who can access rows, and the account password encrypts/decrypts note blobs in the browser.

## Build

```bash
bun run build
```
