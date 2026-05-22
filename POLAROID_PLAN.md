# Polaroid Image Feature — Resume Plan

Context: Add image-adding capability to ezwrite (web + mobile/Android via Capacitor), styled as Polaroid frames (cream `#F5ECDD` background, thick padding, caption strip on bottom, slight tilt). Reference screenshot shows the frame with `lifemaxxxing.` as a caption in a handwritten font.

## Status
- WozCode plugin was outdated (required v0.3.69+, cache had 0.3.40 / 0.3.64).
- User is exiting + restarting Claude Code to reload plugins. After restart, resume from "Build steps".

## Defaults (chosen, override anytime)
- **Storage**: base64 inline in entry data (simplest; works with existing store; swap to filesystem later if needed).
- **Mobile picker**: `@capacitor/camera` with `CameraSource.Prompt` → native Camera/Photos sheet.
- **Web picker**: hidden `<input type="file" accept="image/*">` + drag-and-drop on the editor.
- **Polaroid block**: square image, cream frame `#F5ECDD`, `Caveat` font for caption, optional 1–2° random rotation, inserted at cursor.
- **Caption**: editable per-image, default empty with placeholder "add caption…".

## Build steps
1. Inspect editor/entry component in `src/` to find insertion point and data shape.
2. Install `@capacitor/camera` and run `npx cap sync android`.
3. Create `PolaroidImage` React component (frame + caption + image).
4. Create `useImagePicker` hook that branches on `Capacitor.isNativePlatform()` (native → Camera plugin, web → file input).
5. Add "+ Photo" button to editor toolbar; wire it to the hook.
6. Add drag-and-drop handler on the editor surface for web.
7. Persist images alongside text in the existing journal store (base64 string + optional caption).
8. Smoke test on web (`bun run dev`); build + sync Android for mobile verification.

## Polaroid styling spec
- Outer frame: cream `#F5ECDD`, padding top/sides ~16px, bottom ~64px (caption strip), subtle box-shadow, randomized rotation in `[-3deg, 3deg]`.
- Inner image: 1:1 aspect ratio, fills inner area, `object-fit: cover`.
- Caption: Google Font `Caveat` (or `Patrick Hand`), centered in bottom strip, lowercase, dark text.

## Open questions to confirm after restart
- Confirm storage approach (base64 vs filesystem/IndexedDB) once we see actual journal data size + persistence layer.
- Confirm caption is editable per-image (default assumed yes).

## Resume prompt to paste after restart
"Resume work on the Polaroid image feature using /Users/evancheriyan/Desktop/work/engineering/s:w/files/ezwrite/POLAROID_PLAN.md — start at step 1: inspect the editor/entry component."
