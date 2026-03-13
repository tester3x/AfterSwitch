# AfterSwitch

> Phone settings backup & restore app for Android.
> Scan every setting on your phone, export as JSON, import on new phone, compare differences, auto-restore what's possible.

---

## Project Info
- **Path:** `C:\dev\AfterSwitch\`
- **Framework:** React Native / Expo SDK 54 (managed workflow + native modules via config plugins)
- **Language:** TypeScript
- **Bundle ID:** `com.afterswitch.app`
- **EAS project:** `5a38a963-71b9-4cc1-83b4-c85f8a82c725` (owner: `testerxxx`)
- **EAS builds from git** — uncommitted changes are NOT included. Always `git commit` before `eas build`.
- **EAS free tier:** 1 build at a time. Can't cancel running builds.
- **Firebase project:** Currently shares `wellbuilt-sync`. Needs its own project before Play Store.
- **Website:** `C:\dev\afterswitch-site\` — static HTML, GitHub Pages

---

## Architecture

### App Structure
- **App.tsx** — Root component. State management for profiles, tabs, scanning, import/export. Handles incoming JSON intents via Linking API.
- **5 tabs:** Home, Scan, Compare, Restore, Cloud
- **No navigation library** — simple `activeTab` state switches between screen components

### Screens
| Screen | File | Purpose |
|--------|------|---------|
| Home | `src/screens/HomeScreen.tsx` | Scan button, device info, saved profiles list, export/cloud buttons |
| Scan | `src/screens/ScanScreen.tsx` | Scan progress checklist, scan results summary, export button |
| Compare | `src/screens/CompareScreen.tsx` | Side-by-side diff of two profiles (settings + apps) |
| Restore | `src/screens/RestoreScreen.tsx` | Checklist restore UI: auto-restore, guided, missing apps. Permission checks. |
| Cloud | `src/screens/CloudProfilesScreen.tsx` | Cloud profiles (Coming Soon placeholder) |

### Services
| Service | File | Purpose |
|---------|------|---------|
| Profile Builder | `src/services/profileBuilder.ts` | Scans device settings via native module |
| Profile IO | `src/services/profileIO.ts` | Save/load/export/import profiles. File picker. Intent handler. |
| Profile Compare | `src/services/profileCompare.ts` | Diff engine for two profiles |
| Settings Reader | `src/services/settingsReader.ts` | Native module bridge for reading/writing Android settings |
| Cloud Profiles | `src/services/cloudProfiles.ts` | Firebase cloud storage for profiles |
| Firebase | `src/services/firebase.ts` | Firebase init |

### Components
- `SectionCard.tsx` — Dark card wrapper with title/subtitle
- `PrimaryButton.tsx` — Gold accent button
- `TabButton.tsx` — Tab bar buttons
- `InfoRow.tsx` — Label/value row

### Data
- `src/data/settingsRegistry.ts` — Maps raw setting keys to human labels, groups, restore types, settings intents
- `src/types/profile.ts` — TypeScript types: DeviceProfile (schema v2), ComparisonResult, SettingDiff, AppDiff, etc.

---

## Profile IO Architecture — CRITICAL

### File Naming
`AfterSwitch - {deviceName} - {Mon DD YYYY}.json`
Example: `AfterSwitch - Galaxy S24 Ultra - Mar 12 2026.json`

### Storage Location
Profiles saved to app's document directory under `profiles/` subdirectory.
Uses `expo-file-system/next` File/Directory/Paths API (SDK 54+).

### Import/Save Pattern
**EVERY import path saves a local copy.** This is the core UX principle:
1. `saveProfileLocally(profile)` — writes to `profiles/` dir, returns file URI
2. `listSavedProfiles()` — reads from same `profiles/` dir, returns sorted list
3. `importProfileFromPicker()` — file picker → parse → `saveProfileLocally()` → profile shows in saved list
4. `importProfileFromUri(uri)` — intent handler → `FileSystem.readAsStringAsync(uri)` for content:// URIs → parse → `saveProfileLocally()`
5. `exportProfileJson(profile)` — `saveProfileLocally()` + share sheet

Once imported, a profile is in the saved list forever. No more file picker needed.

### Intent Filter (Android)
App registered as JSON file handler in `app.json` `intentFilters`. Tapping any JSON file in Google Drive, email, Downloads, file manager opens AfterSwitch and auto-imports.

App.tsx handles intents via:
- `Linking.getInitialURL()` — cold start (app opened by tapping file)
- `Linking.addEventListener('url')` — warm start (file opened while app running)

---

## INCOMPLETE / IN PROGRESS

### Show saved file name in the app — DONE
- `App.tsx` — `setSavedFileName()` called after scan, `savedFileName` passed to ScanScreen
- `ScanScreen.tsx` — green "Saved as" box with file name displayed prominently after scan
- `HomeScreen.tsx` — file name shown under each saved profile entry in the list
- Footer status bar also shows `Saved: {fileName}`

### Cloud Profiles
- `CloudProfilesScreen.tsx` shows "Coming Soon"
- Needs Google Sign-In + separate Firebase project
- Cloud buttons (Save to Cloud, Load from Cloud) exist on HomeScreen

### Separate Firebase Project
- Currently shares `wellbuilt-sync` with WellBuilt apps
- Needs its own Firebase project before Play Store submission

---

## Native Module — Device Settings Reader
- **Config plugin:** `plugins/withDeviceSettings.js` — embeds Kotlin source inline (no external .kt files needed for EAS)
- **Native module:** `DeviceSettingsModule` — reads System/Secure/Global/Samsung settings, writes System/Secure/Global settings
- **Permissions:** `WRITE_SETTINGS` (system settings), `WRITE_SECURE_SETTINGS` (secure settings — requires ADB grant)
- **Samsung settings:** Reads from `content://com.samsung.android.settings.provider/` ContentProvider

---

## Schema
- **v1** — legacy, auto-migrated to v2 on import (`migrateV1toV2` in profileIO.ts)
- **v2** — current: `DeviceProfile` type in `src/types/profile.ts`

---

## Git History (latest first)
- `cd73033` — Restore tab: show saved profiles + Browse Files when no comparison loaded
- `1eb5071` — Register as JSON file handler — tap any JSON to import directly
- `8c4af91` — Add app icon — logo in app.json, splash screen, and in-app header
- `c59e622` — Restore cloud buttons (Save to Cloud + Load from Cloud)
- `e3e745b` — Checklist restore + saved profiles on Compare tab + Cloud coming soon
- `1e33ff4` — Fix profileIO to use new expo-file-system/next API
- `4cf2530` — Human-friendly profile management + SafeAreaView fix
- `819dafc` — Fix MainApplication.kt patching for SDK 54 .apply{} pattern
- `6441267` — Embed Kotlin source inline in config plugin for reliable EAS builds
- `fb2a594` — Add native module Kotlin files for EAS build
- `b111f1a` — Initial project scaffold

---

## Build Status
- Latest finished build: `6d6f0fcc` (commit `1eb5071` — intent filter). APK available.
- Build for `cd73033` (Restore tab) was kicked off but status unknown.
- Uncommitted changes in `App.tsx` and `ScanScreen.tsx` need commit + build after file name display is finished.

---

## UX Principles (from user feedback)
1. **NEVER make the user dig through the Android file picker.** Show saved profiles in-app. Intent filter handles first import.
2. **SHOW THE FILE NAME.** After scan, after export, in the saved profiles list — the user needs to know what the file is called and where it is.
3. **Save locally on every import.** Once a profile enters the app from any source, it stays in the saved list.
4. **Cloud buttons stay.** User explicitly said "we are gonna have save to cloud and load from cloud so why would you take to off." Don't remove them.

---

## Styling
- Dark theme: `#0b1020` background, `#1a2340` card bg, `#0f1628` inner card bg
- Accent: `#e6b800` (gold)
- Success: `#4ade80` (green)
- Info: `#60a5fa` (blue)
- Error: `#f87171` (red)
- Text: white primary, `#b7c1d6` secondary, `#8090b0` tertiary, `#6b7fa0` muted
