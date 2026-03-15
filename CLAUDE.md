# AfterSwitch

> Phone settings backup & restore app for Android.
> Scan every setting on your phone, export as JSON, import on new phone, compare differences, auto-restore what's possible, guided wizard for manual settings.

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
- **Firestore collections:**
  - `afterswitch_profiles/{uid}/profiles/{id}` — user-scoped private profiles
  - `shared_profiles/{sharedId}` — community shared profiles (public, read-only except owner)
- **Firestore security rules:** Deployed. User profiles owner-only. Shared profiles: authenticated read, owner create/delete, download increment (+1 only) for non-owners.
- **Firestore indexes:** Composite indexes deployed for `shared_profiles` (manufacturer+downloads DESC for browsing, ownerUid+sharedAt DESC for user's shares).
- **Website:** `C:\dev\afterswitch-site\` — static HTML, GitHub Pages
- **Desktop companion:** `C:\dev\afterswitch-companion\` — Electron app for ADB permission granting

---

## Architecture

### Cloud-First Storage
- **Google Sign-In on first launch** — uses `@react-native-google-signin/google-signin` native account picker → Firebase credential
- **Scan auto-saves to cloud** — `saveProfileToCloud()` runs fire-and-forget after every scan
- **Auto-load on launch** — loads from AsyncStorage first (instant), falls back to cloud if local is empty, runs quick dirty-check against current device settings
- **Compare pulls from cloud** — `CloudProfileList` component fetches user's cloud profiles
- **Restore pulls from cloud** — same `CloudProfileList` component
- **Local save is just cache** — `saveProfileLocally()` still runs for offline access
- **Export via share sheet** — for manual transfer (email, Drive, Bluetooth)
- **Intent filter** — tapping JSON in any file manager imports to AfterSwitch
- **Deep links** — `afterswitch://profile/{code}` for share code lookup

### App Structure
- **App.tsx** — Root component. Auth gate (SignInScreen if not signed in). State management for profiles, tabs, scanning, quick check. Handles incoming JSON intents + share code deep links via Linking API.
- **5 tabs:** Home, Scan, Compare, Restore, Browse
- **No navigation library** — simple `activeTab` state switches between screen components

### Screens
| Screen | File | Purpose |
|--------|------|---------|
| Sign In | `src/screens/SignInScreen.tsx` | Google Sign-In button, shown before app access |
| Home | `src/screens/HomeScreen.tsx` | Device info (with cloud/local badge), smart scan button, export, sign out |
| Scan | `src/screens/ScanScreen.tsx` | Scan progress, results summary with tappable category badges, export |
| Compare | `src/screens/CompareScreen.tsx` | Cloud profile picker → side-by-side diff |
| Restore | `src/screens/RestoreScreen.tsx` | Three-tier restore: Auto → Guided Wizard → Missing Apps |
| Browse | `src/screens/BrowseScreen.tsx` | Community shared profiles browser + share code entry + QR scanner |

### Services
| Service | File | Purpose |
|---------|------|---------|
| Profile Builder | `src/services/profileBuilder.ts` | Scans device settings via native module |
| Profile IO | `src/services/profileIO.ts` | Save/load/export/import profiles locally. Intent handler. |
| Profile Compare | `src/services/profileCompare.ts` | Diff engine for two profiles. Applies valueFormatters. Stores raw + formatted values. |
| Settings Reader | `src/services/settingsReader.ts` | Native module bridge for reading/writing Android settings |
| Cloud Profiles | `src/services/cloudProfiles.ts` | Firebase cloud storage for profiles. `loadLatestCloudProfile()` for auto-load. |
| Shared Profiles | `src/services/sharedProfiles.ts` | Community sharing: share/unshare profiles, browse, search by share code |
| Quick Check | `src/services/quickCheck.ts` | Fast 14-setting spot-check to detect if device matches saved profile |
| Companion Bridge | `src/services/companionBridge.ts` | HTTP client for companion desktop app (ADB shell-privilege writes via USB) |
| Firebase | `src/services/firebase.ts` | Firebase init + Google Sign-In + auth helpers |

### Components
- `SectionCard.tsx` — Dark card wrapper with title/subtitle
- `PrimaryButton.tsx` — Gold accent button
- `TabButton.tsx` — Tab bar buttons
- `InfoRow.tsx` — Label/value row
- `CloudProfileList.tsx` — Shared cloud profile picker (used by Compare + Restore)
- `GuidedWizard.tsx` — Step-by-step guided restore wizard (one setting at a time)
- `ShareProfileModal.tsx` — Share to Community modal (generates share code + deep link + QR)

### Data
- `src/data/settingsRegistry.ts` — Three-tier setting metadata: curated (~34 guided entries with Samsung-specific steps), pattern-matched (by key name), fallback (humanized key name). Includes valueFormatters, steps, intents, acronym expansion.
- `src/types/profile.ts` — TypeScript types: DeviceProfile (schema v2), ComparisonResult, SettingDiff (with rawOldValue/rawNewValue), AppDiff, etc.

---

## Community Sharing System
- **Share to Community** — `ShareProfileModal` creates a `shared_profiles/{id}` doc with share code (6-char alphanumeric), deep link (`afterswitch://profile/{CODE}`), QR code (via `react-native-qrcode-svg`)
- **Browse tab** — Grid of shared profiles sorted by downloads. Manufacturer filter chips. Tap to load as imported profile → Compare tab.
- **Share code entry** — Text input on Browse tab, looks up by share code
- **QR scanner** — Camera-based QR code scanner using `expo-camera`
- **Download counter** — Incremented atomically when non-owner loads a shared profile
- **Deep links** — `afterswitch://profile/{CODE}` opens app and auto-loads shared profile

---

## Smart Scan / Quick Check System
- **Quick dirty-check** (`quickCheck.ts`) — Reads 3 settings namespaces in parallel, spot-checks 14 key settings (brightness, timeout, font_scale, volumes, wifi, bluetooth, input method, navigation mode, rotation, etc.)
- **Threshold:** Allows 1 diff as noise, flags as changed at 5%+ diff rate
- **HomeScreen integration:** Green "Settings match" badge when matched, orange "N settings changed" badge when diffs detected, scan button greyed out when settings match (no point re-scanning)
- **Cloud/Local badges:** Green badge shows "Loaded from Cloud" or "Saved on Device" depending on profile source

---

## Guided Restore Wizard
- **Component:** `src/components/GuidedWizard.tsx`
- **Flow:** Shows one setting at a time → numbered step instructions → "Open Settings" button → user changes setting in Android Settings → returns to app → app auto-verifies → advances to next
- **App resume detection:** `AppState.addEventListener('change')` detects when user returns from Settings app, triggers verification
- **Verification:** Reads current device value via bulk settings reader, compares against `rawNewValue`. If different → success (green check, auto-advance after 1.2s). If same → "unchanged" state with Try Again / Skip buttons.
- **Progress bar:** Animated gold bar + "X of Y" counter
- **Want/Have display:** Shows formatted old value (Want) vs formatted new value (Have)
- **Skip/Exit:** Skip button advances to next, Exit Wizard returns to grouped list

### Settings Registry — Three Tiers
1. **Curated entries (~34 guided):** Full metadata — human label, group, description, restoreType, settingsIntent, samsungIntent, valueFormatter, steps, samsungSteps. Covers keyboard, navigation, AOD, display, gestures, edge panels, accessibility, developer options, date/time, sounds.
2. **Pattern-matched:** Auto-categorized by key name patterns (volume→sound, screen→display, etc.). Gets `formatSmartValue` formatter (0→OFF, 1→ON, package names→friendly names).
3. **Fallback:** Humanized key name with ACRONYMS expansion (aod→"AOD (Always On Display)", wifi→"Wi-Fi", nfc→"NFC", etc.). Gets `formatSmartValue` formatter.

### Smart Generic Instructions
For non-curated settings, keyword detection routes to the right Settings section:
- `aod` keywords → Lock screen > Always On Display
- `motion`/`gesture`/`wake` → Advanced features > Motions and gestures
- `sound`/`vibrat` → Sounds and vibration
- `keyboard`/`input` → General management > Keyboard
- `edge`/`panel` → Display > Edge panels
- Samsung fallback → "Open Settings and search for [label]" (Samsung has a search bar)
- Global dev options → Developer options path with build number instructions
- Ultimate fallback → "Use the search bar at the top of Settings"

---

## Desktop Companion App
- **Path:** `C:\dev\afterswitch-companion\`
- **Framework:** Electron
- **Purpose:** Grant `WRITE_SECURE_SETTINGS` permission via ADB AND write settings via `adb shell settings put` at shell privilege level (app-level `Settings.putString()` is restricted by Android's ContentProvider whitelist even with WRITE_SECURE_SETTINGS)
- **ADB bundled:** `platform-tools/adb.exe` + DLLs copied into project, included via `extraResources` in package.json. Users don't need to install ADB separately.
- **How it works:** Finds bundled ADB first, then system ADB, then PATH. Polls every 3s for connected devices. One-click permission grant button.
- **Grant fix (3/14/2026):** `grantPermission()` no longer calls heavy `dumpsys package` for verification — trusts `pm grant` return. Fixes hang on Android 16. `maxBuffer` increased to 10MB, timeout to 15s.
- **UI:** Dark theme matching the app, shows connection status (yellow dots = searching, green = connected)
- **Note:** Requires USB debugging enabled on phone + USB mode set to "File Transfer" (not "Charge only")

### Companion Bridge (NEW 3/14/2026)
- **HTTP bridge** (`bridge.js`) — local HTTP server on port 38291
- **ADB reverse port forwarding** — `adb reverse tcp:38291 tcp:38291` maps phone's `localhost:38291` to PC's `localhost:38291`
- **Android cleartext HTTP** — requires `usesCleartextTraffic: true` via `expo-build-properties` plugin in app.json
- **Endpoints:**
  - `GET /ping` — health check, returns `{ status: 'ready', serial, version }`
  - `POST /apply-settings` — bulk write settings via ADB. Body: `{ settings: [{ namespace, key, value }] }`. Each setting → `adb shell settings put {namespace} '{key}' '{value}'` (single-quote wrapped). Returns rich status: `{ results: [{ namespace, key, success, status }], successCount, failedCount, notApplicableCount }`
  - `POST /write-setting` — single setting write, returns `{ success, status }`
- **Smart write verification** — `adb.js writeSetting()` reads BEFORE and AFTER write:
  - `success` — value written and verified via read-back
  - `not_applicable` — key didn't exist before write (was 'null') and still doesn't after (cross-device key mismatch)
  - `overridden` — key exists but system enforces a different value (protected setting)
- **Auto-starts** after permission grant or when device reconnects with permission already granted
- **Portable exe** — `npm run build:win` → `dist/AfterSwitch Companion 1.0.0.exe`. Overwrites on rebuild (no version stacking).
- **App-side client** — `src/services/companionBridge.ts`: `isCompanionAvailable()` (2s timeout ping), `writeSettingsViaCompanion()` (bulk write, 30s timeout), `writeSettingViaCompanion()` (single write). Types: `WriteResultStatus`, `WriteResult`, `BulkWriteResult` with `notApplicableCount`.
- **RestoreScreen integration:**
  - Checks companion availability on mount + app resume
  - When companion connected: sends ALL non-defaults settings to companion for shell-privilege writes
  - When no companion: shows blue "Connect Companion for Best Results" warning (always, even with WRITE_SECURE_SETTINGS — permission alone is insufficient due to ContentProvider whitelist)
  - Falls back to native module writes (limited by Android restrictions)
  - Green "● Companion Connected" badge in Restore Progress card
  - All non-defaults guided settings become auto-restorable with companion
  - **Smart status UI:** Green (restored), grey (not on this device), red (system blocked). Color legend after Done banner.
  - **Auto re-scan after restore** — silently re-scans device so restored settings drop out of diff list. No stale counts.

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
- **Community:** Firestore `shared_profiles/{sharedId}` (public)
- **Cache:** App document directory `profiles/` subdirectory (local)
- Uses `expo-file-system/next` File/Directory/Paths API (SDK 54+)

### Import/Save Pattern
1. `saveProfileLocally(profile)` — writes to local `profiles/` dir
2. `saveProfileToCloud(profile)` — writes to Firestore under user's UID
3. `importProfileFromUri(uri)` — intent handler → parse → `saveProfileLocally()`
4. `exportProfileJson(profile)` — `saveProfileLocally()` + share sheet
5. `listCloudProfiles()` — fetches from Firestore, returns metadata
6. `loadCloudProfile(id)` — fetches full profile from Firestore
7. `loadLatestCloudProfile()` — fetches most recent cloud profile (for auto-load on launch)

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
- **Permissions:** `WRITE_SETTINGS` (system settings), `WRITE_SECURE_SETTINGS` (secure settings — requires ADB grant via companion app)
- **Samsung settings:** Reads from `content://com.samsung.android.settings.provider/` ContentProvider

---

## Schema
- **v1** — legacy, auto-migrated to v2 on import (`migrateV1toV2` in profileIO.ts)
- **v2** — current: `DeviceProfile` type in `src/types/profile.ts`

---

## Restore Screen — Three Tiers
1. **Auto-Restore** — System settings that can be written programmatically via `writeSystemSetting()` / `writeSecureSetting()` / `writeGlobalSetting()`. Checkbox list, "Apply All" button. Requires WRITE_SECURE_SETTINGS permission (granted via companion app).
2. **Guided Restore** — Settings that require manual changes in Android Settings. Two modes:
   - **Grouped list** — Collapsible groups by category with "Open Settings" buttons (default view)
   - **Guided Wizard** — One-at-a-time step-through wizard with instructions, verify-on-return, auto-advance (activated by "Start Guided Restore" button)
3. **Missing Apps** — Apps on old phone not on new phone, with Play Store links

---

## Recent Git History (latest first, all committed + pushed)
- `cc410e4` — Re-scan device after restore so restored settings drop out of diff list
- `b1cf5bf` — Companion warning always shows when disconnected + restore status legend
- `e3b5597` — Smart restore status: success / not_applicable / overridden (3-way classification)
- `219508e` — Add 18 new junk key patterns (hearing calibration, BT codec volumes, runtime state)
- `a89165b` — Fix restore count mismatch (use allRestorableDiffs instead of comparison.settings)
- `1fb0895` — Enable cleartext HTTP for companion bridge (usesCleartextTraffic)
- `88c4593` — Companion bridge: app-side HTTP client + RestoreScreen integration
- `a370d29` — Remove samsung bucket from comparison (fixes false success + reverts)
- `5f38a5a` — Skip settings that don't exist on target device
- `a9c39c5` — Add profile name to Restore Progress card
- `9e68dba` — Fix profileIO.ts TypeScript errors
- `4c44f28` — Paginate CollapsibleGroup diffs in RestoreScreen
- `7fa8d51` — Paginate all long lists (Scan details, Compare diffs)
- `630487d` — Fix app list OOM crash: paginate 20 at a time

---

## UX Principles (from user feedback)
1. **Cloud is THE storage.** Users sign in with Google, profiles live in the cloud. No file management.
2. **SHOW THE FILE NAME.** After scan — user needs to know what happened.
3. **One-tap access.** Compare and Restore show cloud profiles immediately. No extra steps.
4. **Intent filter for imports.** Tap a JSON anywhere on the phone → AfterSwitch opens.
5. **No file pickers.** Nobody knows how to browse a phone's file system.
6. **Human-readable values.** Never show raw "0"/"1" — always "OFF"/"ON". Never show `com.samsung.android.foo` — show "Samsung Keyboard". Target audience isn't technical.
7. **Smart instructions.** Don't tell users "look for a Samsung setting" — tell them exactly which Settings section to open.

---

## Firebase Project — `afterswitch-app`
- **Own project** — completely separate from `wellbuilt-sync` (created 3/13/2026)
- Google Sign-In enabled, SHA-1 fingerprint added
- Firestore rules deployed (user profiles + shared profiles + download increment)
- Firestore composite indexes deployed (browsing by manufacturer + downloads, user shares by date)
- `google-services.json` has both Android + Web OAuth clients

---

## Styling
- Dark theme: `#0b1020` background, `#1a2340` card bg, `#0f1628` inner card bg
- Accent: `#e6b800` (gold)
- Success: `#4ade80` (green)
- Info: `#60a5fa` (blue)
- Error: `#f87171` (red)
- Warning: `#f59e0b` (amber)
- Text: white primary, `#b7c1d6` secondary, `#8090b0` tertiary, `#6b7fa0` muted

---

## Known Issues / Pre-existing
- **App-level writes blocked by Android ContentProvider whitelist (ROOT CAUSE 3/14/2026, FIXED `88c4593`):** Even with WRITE_SECURE_SETTINGS granted, `Settings.Secure.putString()` is blocked for most keys on Android 12+. The SettingsProvider has its own internal whitelist that blocks app-level callers. Only `adb shell settings put` bypasses this (runs at shell privilege). Fix: companion bridge sends settings via HTTP → companion writes each setting via `adb shell settings put`. Without companion, falls back to native module writes (limited).
- **Samsung namespace was duplicating diffs (FIXED `a370d29`):** `getSamsungSettings()` scans all 3 providers and dumps into one flat `samsung` map — but those keys already exist in their correct system/secure/global buckets. The samsung restore branch tried `writeSystemSetting` first, which appeared to succeed (in-memory cache) but wrote to the wrong namespace. Settings reverted on app restart. Fix: removed samsung from comparison entirely.
- **Cross-model settings that don't exist on target (FIXED `5f38a5a`):** Comparison was including settings only on the source device. These always fail to write. Fix: skip diffs where key exists on source but not target.
- **Companion app ADB connection:** Requires USB debugging ON + USB mode "File Transfer" (not "Charge only"). If phone is set to "Charge only, don't ask again," user must change via notification shade tap or Settings > Developer Options > Default USB configuration.
- **Companion Grant button hangs on Android 16 (FIXED):** `dumpsys package` verification was too heavy. Fixed: trust `pm grant` return, skip verification.
