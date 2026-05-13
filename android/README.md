# ezwrite Android

This folder starts a native Android version of ezwrite.

Current approach: build the Android app as native platform UI, not a WebView wrapper. The first vertical slice is intentionally small: native editor surface, app-private local persistence, page switching, timer controls, and Android share/export intent.

## Requirements

- Android Studio with the Android SDK installed
- JDK 17 or newer
- Node dependencies installed at the repo root

This machine does not currently have Java, Gradle, or `ANDROID_HOME` configured, so native build verification has to happen after Android Studio or a JDK/SDK toolchain is installed.

## Build

From this folder after installing Android Studio/JDK:

```bash
gradle :app:assembleDebug
```

Android Studio can also open this `android` folder directly and sync the Gradle project.

## Next Work

1. Generate or add a Gradle wrapper once a local Android toolchain is available.
2. Move persistence from SharedPreferences to SQLite/Room if document structure grows beyond plain pages.
3. Recreate ezWrite formatting/slash commands as native interactions.
4. Add native PDF/image export.
5. Run manual QA for typing, timer, page switching, settings, export, kill/relaunch persistence, and offline startup.
