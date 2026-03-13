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
- **Firebase project:** `afterswitch-app` (separate from wellbuilt-sync, created 3/13/2026)
- **Firebase Android app:** `1:1022312211034:android:e301b5aaab762336a86e63` (com.afterswitch.app)
- **Firebase Web client ID:** `1022312211034-25hdb5bgmujagtmukl07e1j2cpkhhjr5.apps.googleusercontent.com`
- **Firestore:** `afterswitch_profiles/{uid}/profiles/{id}` — security rules deployed, user-scoped
- **Website:** `C:\dev\afterswitch-site\` — static HTML, GitHub Pages

---

## Architecture

### Cloud-First Storage (CURRENT — 3/13/2026)
- **Google Sign-In on first launch** — uses `@react-native-google-signin/google-signin` native account picker → Firebase credential
- **Scan auto-saves to cloud** — `saveProfileToCloud()` runs fire-and-forget after every scan
- **Compare pulls from cloud** — `CloudProfileList` component fetches user's cloud profiles
- **Restore pulls from cloud** — same `CloudProfileList` component
- **Local save is just cache** — `saveProfileLocally()` still runs for offline access
- **Export via share sheet** — for manual transfer (email, Drive, Bluetooth)
- **Intent filter** — tapping JSON in any file manager imports to AfterSwitch

### App Structure
- **App.tsx** — Root component. Auth gate (SignInScreen if not signed in). State management for profiles, tabs, scanning. Handles incoming JSON intents via Linking API.
- **4 tabs:** Home, Scan, Compare, Restore
- **No navigation library** — simple `activeTab` state switches between screen components

### Screens
| Screen | File | Purpose |
|--------|------|---------|
| Sign In | `src/screens/SignInScreen.tsx` | Google Sign-In button, shown before app access |
| Home | `src/screens/HomeScreen.tsx` | Scan button, device info, export, sign out |
| Scan | `src/screens/ScanScreen.tsx` | Scan progress, results summary with tappable category badges, export |
| Compare | `src/screens/CompareScreen.tsx` | Cloud profile picker → side-by-side diff |
| Restore | `src/screens/RestoreScreen.tsx` | Cloud profile picker → checklist restore UI |

### Services
| Service | File | Purpose |
|---------|------|---------|
| Profile Builder | `src/services/profileBuilder.ts` | Scans device settings via native module |
| Profile IO | `src/services/profileIO.ts` | Save/load/export/import profiles locally. Intent handler. |
| Profile Compare | `src/services/profileCompare.ts` | Diff engine for two profiles |
| Settings Reader | `src/services/settingsReader.ts` | Native module bridge for reading/writing Android settings |
| Cloud Profiles | `src/services/cloudProfiles.ts` | Firebase cloud storage for profiles |
| Firebase | `src/services/firebase.ts` | Firebase init + Google Sign-In + auth helpers |

### Components
- `SectionCard.tsx` — Dark card wrapper with title/subtitle
- `PrimaryButton.tsx` — Gold accent button
- `TabButton.tsx` — Tab bar buttons
- `InfoRow.tsx` — Label/value row
- `CloudProfileList.tsx` — Shared cloud profile picker (used by Compare + Restore)

### Data
- `src/data/settingsRegistry.ts` — Maps raw setting keys to human labels, groups, restore types, settings intents
- `src/types/profile.ts` — TypeScript types: DeviceProfile (schema v2), ComparisonResult, SettingDiff, AppDiff, etc.

---

## Auth — Google Sign-In

### Setup Required (Firebase Console)
1. Firebase Console → Authentication → Sign-in method → **Enable Google**
2. Copy the **Web client ID** shown after enabling
3. Paste in `src/services/firebase.ts` → `WEB_CLIENT_ID` constant
4. Firebase Console → Project Settings → Android app (`com.afterswitch.app`) → **Add SHA-1 fingerprint**
   - Run `eas credentials` → select preview → choose existing keystore → copy SHA-1
5. Re-download `google-services.json` after adding SHA-1 (it updates the oauth_client array)

### Flow
1. App launches → `onAuthStateChanged` fires
2. No user → `SignInScreen` shown
3. User taps "Sign in with Google" → native Google Play Services account picker
4. User picks their Google account (already on device) → `idToken` returned
5. `GoogleAuthProvider.credential(idToken)` → `signInWithCredential(auth, credential)`
6. Auth state changes → app renders normally

---

## Profile IO Architecture

### File Naming
`AfterSwitch - {deviceName} - {Mon DD YYYY}.json`
Example: `AfterSwitch - Galaxy S24 Ultra - Mar 13 2026.json`

### Storage
- **Primary:** Firestore `afterswitch_profiles/{uid}/profiles/{id}` (cloud)
- **Cache:** App document directory `profiles/` subdirectory (local)
- Uses `expo-file-system/next` File/Directory/Paths API (SDK 54+)

### Import/Save Pattern
1. `saveProfileLocally(profile)` — writes to local `profiles/` dir
2. `saveProfileToCloud(profile)` — writes to Firestore under user's UID
3. `importProfileFromUri(uri)` — intent handler → parse → `saveProfileLocally()`
4. `exportProfileJson(profile)` — `saveProfileLocally()` + share sheet
5. `listCloudProfiles()` — fetches from Firestore, returns metadata
6. `loadCloudProfile(id)` — fetches full profile from Firestore

### Intent Filter (Android)
App registered as JSON file handler in `app.json` `intentFilters`. Tapping any JSON file in Google Drive, email, Downloads, file manager opens AfterSwitch and auto-imports.

---

## Scan Screen — Tappable Badges
- After scan, summary badges (System, Secure, Global, Samsung, Apps, Defaults) are **tappable**
- Tapping a badge expands a list of all settings/apps in that category
- Gold border highlights the active badge
- Tap again or "Tap to close" to collapse

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
- `5aba6f8` — Wire up CloudProfilesScreen to list/load/delete cloud profiles
- `ef07a7b` — Remove file picker, show saved file name, simplify IO
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

## UX Principles (from user feedback)
1. **Cloud is THE storage.** Users sign in with Google, profiles live in the cloud. No file management.
2. **SHOW THE FILE NAME.** After scan — user needs to know what happened.
3. **One-tap access.** Compare and Restore show cloud profiles immediately. No extra steps.
4. **Intent filter for imports.** Tap a JSON anywhere on the phone → AfterSwitch opens.
5. **No file pickers.** Nobody knows how to browse a phone's file system.

---

## Firebase Project — `afterswitch-app`
- **Own project** — completely separate from `wellbuilt-sync` (created 3/13/2026)
- Google Sign-In enabled, SHA-1 fingerprint added, Firestore rules deployed
- `google-services.json` has both Android + Web OAuth clients

---

## Styling
- Dark theme: `#0b1020` background, `#1a2340` card bg, `#0f1628` inner card bg
- Accent: `#e6b800` (gold)
- Success: `#4ade80` (green)
- Info: `#60a5fa` (blue)
- Error: `#f87171` (red)
- Text: white primary, `#b7c1d6` secondary, `#8090b0` tertiary, `#6b7fa0` muted
