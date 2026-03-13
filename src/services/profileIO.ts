/**
 * Profile import/export with human-friendly file management.
 *
 * Uses the new expo-file-system File/Directory/Paths API (SDK 54+).
 * Profiles saved to app documents under "profiles/" with readable names.
 */

import * as FileSystem from 'expo-file-system';
import { File, Directory, Paths } from 'expo-file-system/next';
import * as Sharing from 'expo-sharing';
import type { DeviceProfile } from '../types/profile';

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
      const content = item.text();
      const parsed = JSON.parse(content);

      if (parsed.device && parsed.settings) {
        profiles.push({
          fileName: item.name,
          filePath: item.uri,
          deviceName: parsed.device.nickname || parsed.device.model || 'Unknown',
          manufacturer: parsed.device.manufacturer || '',
          exportedAt: parsed.exportedAt || '',
          settingsCount:
            Object.keys(parsed.settings.system || {}).length +
            Object.keys(parsed.settings.secure || {}).length +
            Object.keys(parsed.settings.global || {}).length +
            Object.keys(parsed.settings.samsung || {}).length,
          appsCount: parsed.apps?.installed?.length || 0,
        });
      }
    } catch {
      // Skip malformed files
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
  const content = file.text();
  const parsed = JSON.parse(content);
  return validateAndMigrate(parsed);
}

/**
 * Import a profile from a content:// or file:// URI (from Android intent).
 * Used when user taps a JSON file in another app and it opens in AfterSwitch.
 */
export async function importProfileFromUri(uri: string): Promise<DeviceProfile> {
  // content:// URIs need the base FileSystem API, not the /next File class
  const content = await FileSystem.readAsStringAsync(uri);

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('Invalid JSON file. Please select an AfterSwitch profile.');
  }

  const profile = validateAndMigrate(parsed);

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

// ==================== Validation / Migration ====================

function validateAndMigrate(data: any): DeviceProfile {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid profile: not an object.');
  }

  if (!data.device || !data.settings) {
    throw new Error('Invalid profile: missing device or settings.');
  }

  if (data.schemaVersion === 1 || !data.schemaVersion) {
    return migrateV1toV2(data);
  }

  if (data.schemaVersion === 2) {
    return data as DeviceProfile;
  }

  throw new Error(`Unknown schema version: ${data.schemaVersion}`);
}

function migrateV1toV2(v1: any): DeviceProfile {
  const defaults: Record<string, { packageName: string; label: string } | null> = {};
  if (v1.defaults) {
    for (const [key, value] of Object.entries(v1.defaults)) {
      if (typeof value === 'string') {
        defaults[key] = { packageName: '', label: value as string };
      } else if (value && typeof value === 'object') {
        defaults[key] = value as { packageName: string; label: string };
      }
    }
  }

  const installed = Array.isArray(v1.apps?.installedPackages)
    ? v1.apps.installedPackages.map((pkg: string) => ({
        packageName: pkg,
        label: pkg.split('.').pop() || pkg,
        versionName: '',
        isSystemApp: false,
      }))
    : v1.apps?.installed || [];

  return {
    schemaVersion: 2,
    exportedAt: v1.exportedAt || new Date().toISOString(),
    exportedBy: v1.exportedBy || 'AfterSwitch (migrated from v1)',
    device: {
      nickname: v1.device.nickname || v1.device.model || 'Unknown',
      manufacturer: v1.device.manufacturer || 'Unknown',
      brand: v1.device.brand || v1.device.manufacturer || 'Unknown',
      model: v1.device.model || 'Unknown',
      os: 'Android',
      osVersion: v1.device.osVersion || '0',
      sdkInt: v1.device.sdkInt || 0,
      securityPatch: v1.device.securityPatch || '',
      oneUiVersion: v1.device.oneUiVersion || null,
    },
    defaults,
    settings: {
      system: v1.settings?.system || {},
      secure: v1.settings?.secure || {},
      global: v1.settings?.global || {},
      samsung: v1.settings?.samsung || {},
    },
    apps: { installed },
  };
}
