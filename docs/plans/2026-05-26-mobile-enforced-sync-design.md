# Enforced Sync on Mobile Web — Design (2026-05-26)

## Problem
On mobile web, ezWrite's live data lives in localStorage, which iOS Safari evicts after ~7 days of no use (it clears all script-writable storage at once). A local-only second copy (OPFS) can't survive that — only an off-device (cloud) copy does. So on mobile web we require cloud sync (sign-in): no writing is ever device-only.

## Scope
- Target: mobile web (touch browsers, `pointer: coarse`).
- Desktop unchanged — sync stays optional / per-project.
- Capacitor native app out of scope.

## Components

### 1. Session persistence (prerequisite)
Today `SyncSession` (accessToken, refreshToken, username, plan, userId, masterKey `CryptoKey`) lives only in React state, so a reload logs you out. On mobile that would mean re-entering the password on basically every visit.
- Store the whole session in a dedicated IndexedDB db (`ezwrite-sync-session`, store `session`, key `current`). IndexedDB structured-clones the non-extractable `masterKey` CryptoKey; localStorage cannot hold a CryptoKey.
- New module `src/lib/sync-session-store.ts`: `saveSyncSession` / `loadSyncSession` / `clearSyncSession`.
- Wire into `WritingInterface`: restore on mount; save on unlock; clear on lock; re-save after each successful sync (Supabase rotates refresh tokens, so persist the updated tokens or the next restore fails).
- Security: the master key is non-extractable (scripts can't copy it out); a stolen token still can't decrypt without the password. Residual risk: someone on the unlocked device can open the app. Eviction clears it too — fine, the cloud copy survives.

### 2. Mobile sign-in gate
- `isMobile && !syncSession && sessionRestored && syncConfigured` → early-return a full-screen sign-in gate instead of the editor.
- Reuses `handleUnlockSync` + `syncUsername`/`syncPassword`/`syncError`/`syncBusy`. Sign in + Create account.
- `sessionRestored` flag avoids a gate→editor flash during async restore.
- If Supabase isn't configured → no gate (can't enforce; fall back to local writing). Production is always configured.

### 3. Mobile auto-sync
- On mobile sign-in (and on mobile restore): set `syncEnabled = true` for all projects; default new projects to sync-on on mobile. Reuses the existing per-project sync pipeline (queue/push/retry) — no new sync engine.
- Hide the per-project sync toggle in Settings on mobile (always on).

### 4. Demo switch
- `?mobile=1` URL param folds into `isTouchDevice` so the full mobile experience (including the gate) shows on a desktop browser — for private, local demos with no phone and no deploy.

## Verification
- Local only. Dev server + `?mobile=1`: gate blocks writing → sign in → editor appears → reload → still signed in. Desktop (no param) unaffected. Typecheck + existing tests.
- No push, no deploy until the user approves (keep private).

## Out of scope (YAGNI)
OPFS read-back recovery, remote-as-primary, localStorage purge, separate onboarding modal, anonymous backup.

## Tasks
1. Persist + restore sync session
2. Mobile sign-in gate UI
3. Mobile auto-sync all projects
4. `?mobile=1` dev demo switch
5. Verify locally + commit (no push)
