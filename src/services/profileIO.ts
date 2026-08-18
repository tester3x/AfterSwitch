/**
 * Profile import/export with human-friendly file management.
 *
 * Uses the new expo-file-system File/Directory/Paths API (SDK 54+).
 * Profiles saved to app documents under "profiles/" with readable names.
 */

import * as LegacyFileSystem from 'expo-file-system/legacy';
import { File, Directory, Paths } from 'expo-file-system/next';
import * as Sharing from 'expo-sharing';
import type { DeviceProfile } from '../types/profile';
import {
  assertImportSizeOk,
  validateAndMigrateProfile,
} from './profileValidation';

/** Profiles directory inside the app's document dir */
const profilesDir = new Directory(Paths.document, 'profiles');

/**
 * Ensure the profiles directory exists.
 */
function ensureProfilesDir(): void {
  if (!profilesDir.exists) {
    profilesDir.create();
  }
}

/**
 * Generate a human-readable file name from a profile.
 * Example: "AfterSwitch - Galaxy S24 Ultra - Mar 12 2026.json"
 */
function generateFileName(profile: DeviceProfile): string {
  const deviceName = profile.device.nickname || profile.device.model || 'Unknown Device';
  const safeDevice = deviceName.replace(/[^a-zA-Z0-9 '-]/g, '').trim();

  const date = new Date(profile.exportedAt);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dateStr = `${months[date.getMonth()]} ${date.getDate()} ${date.getFullYear()}`;

  return `AfterSwitch - ${safeDevice} - ${dateStr}.json`;
}

/**
 * Save a profile to the app's profiles directory.
 * Returns the file URI.
 */
export function saveProfileLocally(profile: DeviceProfile): string {
  ensureProfilesDir();
  const fileName = generateFileName(profile);
  const file = new File(profilesDir, fileName);
  file.write(JSON.stringify(profile, null, 2));
  return file.uri;
}

/**
 * Export profile: save locally + open share sheet for transfer.
 */
export async function exportProfileJson(profile: DeviceProfile): Promise<string> {
  const fileUri = saveProfileLocally(profile);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType: 'application/json',
      dialogTitle: 'Send AfterSwitch Profile',
    });
  }

  return fileUri;
}

/**
 * List all saved profiles in the app's profiles directory.
 * Returns them sorted newest first.
 */
export function listSavedProfiles(): SavedProfileInfo[] {
  ensureProfilesDir();

  const profiles: SavedProfileInfo[] = [];

  for (const item of profilesDir.list()) {
    if (!(item instanceof File) || !item.name.endsWith('.json')) continue;

    try {
      // textSync() is the synchronous read. The previous code called the
      // async text() and cast the Promise to string, so JSON.parse always
      // received "[object Promise]" and threw straight into the empty catch
      // below — every saved profile was silently skipped.
      const content = item.textSync();
      assertImportSizeOk(content);
      const parsed: unknown = JSON.parse(content);

      // Validate before reading fields off it. The summary below is drawn
      // from the VALIDATED profile, never from the raw parsed object, so a
      // hostile file cannot put arbitrary values into the picker UI.
      const profile = validateAndMigrateProfile(parsed);

      profiles.push({
        fileName: item.name,
        filePath: item.uri,
        deviceName: profile.device.nickname || profile.device.model || 'Unknown',
        manufacturer: profile.device.manufacturer,
        exportedAt: profile.exportedAt,
        settingsCount:
          Object.keys(profile.settings.system).length +
          Object.keys(profile.settings.secure).length +
          Object.keys(profile.settings.global).length +
          Object.keys(profile.settings.samsung).length,
        appsCount: profile.apps.installed.length,
      });
    } catch {
      // Skip unreadable or malformed files — a bad file in the directory
      // must not break the whole list.
    }
  }

  // Sort newest first
  profiles.sort((a, b) => new Date(b.exportedAt).getTime() - new Date(a.exportedAt).getTime());
  return profiles;
}

export type SavedProfileInfo = {
  fileName: string;
  filePath: string;
  deviceName: string;
  manufacturer: string;
  exportedAt: string;
  settingsCount: number;
  appsCount: number;
};

/**
 * Load a profile from a specific file path/URI.
 */
export function loadProfileFromPath(filePath: string): DeviceProfile {
  const file = new File(filePath);
  // textSync(), not text(): see listSavedProfiles above.
  const content = file.textSync();
  assertImportSizeOk(content);
  const parsed: unknown = JSON.parse(content);
  return validateAndMigrateProfile(parsed);
}

/**
 * Import a profile from a content:// or file:// URI (from Android intent).
 * Used when user taps a JSON file in another app and it opens in AfterSwitch.
 */
export async function importProfileFromUri(uri: string): Promise<DeviceProfile> {
  let content: string;

  if (uri.startsWith('content://')) {
    // content:// URIs (Quick Share, media store) can't be read directly.
    // Copy to a temp file first, then read the temp file.
    const tempPath = LegacyFileSystem.cacheDirectory + 'import_temp.json';
    await LegacyFileSystem.copyAsync({ from: uri, to: tempPath });
    content = await LegacyFileSystem.readAsStringAsync(tempPath);
    // Clean up temp file (fire-and-forget)
    LegacyFileSystem.deleteAsync(tempPath, { idempotent: true }).catch(() => {});
  } else {
    content = await LegacyFileSystem.readAsStringAsync(uri);
  }

  // Bound the raw text BEFORE parsing: an oversized file must be refused
  // without first materialising a multi-megabyte object graph.
  assertImportSizeOk(content);

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('Invalid JSON file. Please select an AfterSwitch profile.');
  }

  const profile = validateAndMigrateProfile(parsed);

  // Save a copy locally so it shows up in the saved profiles list
  saveProfileLocally(profile);

  return profile;
}

/**
 * Delete a saved profile file.
 */
export function deleteSavedProfile(filePath: string): void {
  const file = new File(filePath);
  if (file.exists) {
    file.delete();
  }
}

// Validation and v1->v2 migration now live in ./profileValidation, so the
// untrusted-input boundary is one testable module instead of inline casts.
