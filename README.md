# AfterSwitch

AfterSwitch is an Android-first app concept for capturing your preferred phone setup before you switch devices, then helping you finish the setup on the new phone after Smart Switch or another migration tool runs.

## Current scaffold
This starter includes:

- Expo + React Native + TypeScript
- A device profile schema
- Sample profile creation
- JSON export and import
- Basic profile comparison
- Guided restore checklist structure

## Project structure

- `App.tsx` — simple tabbed shell
- `src/types/profile.ts` — profile schema
- `src/services/profileBuilder.ts` — sample snapshot builder
- `src/services/profileIO.ts` — export/import JSON
- `src/services/profileCompare.ts` — mismatch detection
- `src/screens/*` — starter screens
- `src/components/*` — UI primitives

## Next build steps

1. Replace the sample profile with real Android data collectors
2. Add persistent storage for the live local profile
3. Add Android permissions and native modules where needed
4. Add route-to-settings shortcuts for Samsung-specific checklist items
5. Add a desktop helper for deeper ADB-assisted export/restore

## Run

```bash
npm install
npx expo start
```
