# Local-First Mobile Store Build Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship `ezwrite` as a local-first app on web, iOS, and Android, with App Store and Play Store distribution and native on-device persistence on mobile.

**Architecture:** Keep the current React/Vite app as the shared product surface. Split persistence, export, and share behavior behind a platform adapter so web can continue using browser APIs while iOS and Android use native-backed storage. Treat browser storage inside mobile shells as cache only, never as the source of truth.

**Tech Stack:** React 18, TypeScript, Vite, Vite PWA, Capacitor, native SQLite on mobile, browser storage APIs on web, jsPDF.

---

### Task 1: Freeze current web behavior and define success criteria

**Files:**
- Modify: `README.md`
- Create: `docs/plans/2026-04-20-local-first-mobile-store-build.md.tasks.json`
- Test: `src/components/writing-helpers.test.ts`

**Checklist:**
- Record the non-negotiable product constraints:
  - App Store and Play Store distribution is required.
  - Mobile notes are stored on-device locally.
  - Mobile apps must not rely on transient browser-managed memory as the source of truth.
  - No sync/account/backend scope in v1.
- Expand the current test coverage around writing behavior before platform refactors.
- Verify the current web app still builds and existing tests pass before mobile work begins.

**Verify:**
- `npm run build`
- `npm run lint`
- `npm test` or the repo’s chosen test command once added/normalized

### Task 2: Extract a platform storage contract from browser-specific code

**Files:**
- Create: `src/lib/platform/types.ts`
- Create: `src/lib/platform/storage-adapter.ts`
- Create: `src/lib/platform/web-storage-adapter.ts`
- Modify: `src/lib/storage.ts`
- Modify: `src/components/WritingInterface.tsx`

**Checklist:**
- Define a storage interface for:
  - load document pages
  - save document pages
  - load/save settings
  - export current content
  - optional import/open behavior
- Move browser-specific APIs out of `WritingInterface.tsx`.
- Preserve current web behavior through the new interface.
- Make web the reference implementation first.

**Verify:**
- Web behavior matches current save/export flows.
- No direct browser storage logic remains in UI code except via the adapter.

### Task 3: Separate document persistence from export/share behavior

**Files:**
- Create: `src/lib/platform/export-adapter.ts`
- Create: `src/lib/platform/web-export-adapter.ts`
- Modify: `src/components/WritingInterface.tsx`
- Modify: `src/components/InfoDialog.tsx`

**Checklist:**
- Treat persistence and export as separate concerns.
- Keep documents in app-managed storage.
- Keep Markdown/TXT/PDF/share as explicit user actions.
- Preserve current browser download/share flows on web.

**Verify:**
- Autosave persists locally without depending on export.
- Export still produces the expected file formats.

### Task 4: Add Capacitor app shells for iOS and Android

**Files:**
- Create: `capacitor.config.ts`
- Create: `ios/` project scaffold
- Create: `android/` project scaffold
- Modify: `package.json`
- Modify: `README.md`

**Checklist:**
- Add Capacitor to the repo.
- Generate iOS and Android shells from the existing web app.
- Add scripts for:
  - sync/copy web assets into native shells
  - open native projects
  - build web + sync mobile
- Keep the web build as the shared asset pipeline.

**Verify:**
- Web app can be copied into native shells successfully.
- iOS project opens and runs locally.
- Android project opens and runs locally.

### Task 5: Implement native-backed mobile persistence

**Files:**
- Create: `src/lib/platform/mobile-storage-adapter.ts`
- Modify: `src/lib/platform/storage-adapter.ts`
- Modify: `src/components/WritingInterface.tsx`
- Create: native bridge/plugin configuration files required by Capacitor storage layer

**Checklist:**
- Use native SQLite as the mobile source of truth.
- Store:
  - document pages/content
  - settings/preferences
  - lightweight metadata such as updated-at
- Do not rely on `localStorage`, IndexedDB, or OPFS for canonical mobile persistence.
- Use browser-managed storage on mobile only as temporary cache if needed.

**Verify:**
- Write, kill app, relaunch, content still exists on iOS.
- Write, kill app, relaunch, content still exists on Android.
- Storage survives normal background/foreground lifecycle transitions.

### Task 6: Add mobile-native export, import, and share flows

**Files:**
- Create: `src/lib/platform/mobile-export-adapter.ts`
- Modify: `src/components/WritingInterface.tsx`
- Modify: `src/lib/platform/export-adapter.ts`

**Checklist:**
- Support export of current content to:
  - Markdown
  - TXT
  - PDF
- Use native share/open-in flows on mobile.
- Keep internal documents private to the app unless the user explicitly exports.
- If import is added in v1, constrain it to simple text/Markdown files only.

**Verify:**
- Exported files can be shared from iOS and Android.
- Exported content matches the current web export semantics.

### Task 7: Make the editor reliable on mobile

**Files:**
- Modify: `src/components/WritingInterface.tsx`
- Modify: `src/index.css`
- Modify: any mobile-specific utility files created during implementation

**Checklist:**
- Fix keyboard/viewport handling for iOS and Android.
- Validate caret, selection, line insertion, slash commands, and timer interactions on touch devices.
- Ensure autosave cadence does not cause visible lag or input jank.
- Keep the mobile UI aligned with the current product, not a separate redesign.

**Verify:**
- Manual QA on both platforms for:
  - typing
  - page switching
  - slash commands
  - timer usage
  - export/share

### Task 8: Prepare store-compliant app metadata and native configuration

**Files:**
- Create: `docs/release/app-store-checklist.md`
- Create: `docs/release/play-store-checklist.md`
- Modify: native project config files under `ios/` and `android/`
- Create/Modify: app icons, splash assets, bundle/application identifiers

**Checklist:**
- Set app name, bundle IDs, versioning, and signing configuration.
- Add app icons, splash screens, and privacy strings.
- Document what the app stores locally and what it does not sync.
- Verify the app meets baseline store submission requirements.

**Verify:**
- iOS archive builds cleanly.
- Android release build/apk/aab builds cleanly.
- Submission metadata checklist is complete.

### Task 9: Regression verification across all three platforms

**Files:**
- Create: `docs/release/manual-qa-matrix.md`
- Modify: `README.md`

**Checklist:**
- Run a release verification matrix for:
  - web
  - iOS
  - Android
- Cover:
  - autosave
  - relaunch persistence
  - export/share
  - settings persistence
  - offline startup
  - install/update behavior
- Record known limitations explicitly.

**Verify:**
- QA matrix completed with pass/fail notes for each platform.
- Remaining risks documented before store submission.

### Task 10: Ship and maintain the task list through execution

**Files:**
- Modify: `docs/plans/2026-04-20-local-first-mobile-store-build.md.tasks.json`
- Modify: `README.md`
- Modify: release checklist docs as work completes

**Checklist:**
- Update task statuses as implementation progresses.
- Keep the machine-readable task file current in every implementation pass.
- Do not mark mobile complete until:
  - native persistence is verified on device
  - store builds are produced
  - QA matrix is filled in

**Verify:**
- Task file status matches the actual repo state.
- Final report references completed tasks and remaining risks.
