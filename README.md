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
4. Open ezWrite settings, enter same sync password on each device, then toggle sync on per doc.

Supabase stores encrypted note blobs only. The sync password is not sent to Supabase.

## Build

```bash
bun run build
```
