/**
 * Profile import/export with human-friendly file management.
 *
 * Profiles are saved to the app's documents directory under a "profiles/" folder
 * with clear, recognizable names like "AfterSwitch - Galaxy S24 Ultra - Mar 12 2026.json".
 *
 * Export: saves locally + opens share sheet for transfer to another device.
 * Import: shows saved profiles list first, falls back to file picker.
 */

import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { DeviceProfile } from '../types/profile';

/** Directory where profiles are stored inside the app's document dir */
const PROFILES_DIR = `${FileSystem.documentDirectory}profiles/`;

/**
 * Ensure the profiles directory exists.
 */
async function ensureProfilesDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(PROFILES_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(PROFILES_DIR, { intermediates: true });
  }
}

/**
 * Generate a human-readable file name from a profile.
 * Example: "AfterSwitch - Galaxy S24 Ultra - Mar 12 2026.json"
 */
function generateFileName(profile: DeviceProfile): string {
  // Use device nickname or model for the device part
  const deviceName = profile.device.nickname || profile.device.model || 'Unknown Device';
  // Clean for filesystem safety
  const safeDevice = deviceName.replace(/[^a-zA-Z0-9 '-]/g, '').trim();

  // Human-readable date
  const date = new Date(profile.exportedAt);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dateStr = `${months[date.getMonth()]} ${date.getDate()} ${date.getFullYear()}`;

  return `AfterSwitch - ${safeDevice} - ${dateStr}.json`;
}

/**
 * Save a profile to the app's profiles directory.
 * Returns the file URI.
 */
export async function saveProfileLocally(profile: DeviceProfile): Promise<string> {
  await ensureProfilesDir();
  const fileName = generateFileName(profile);
  const filePath = PROFILES_DIR + fileName;

  await FileSystem.writeAsStringAsync(filePath, JSON.stringify(profile, null, 2));
  return filePath;
}

/**
 * Export profile: save locally + open share sheet for transfer.
 */
export async function exportProfileJson(profile: DeviceProfile): Promise<string> {
  const filePath = await saveProfileLocally(profile);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(filePath, {
      mimeType: 'application/json',
      dialogTitle: 'Send AfterSwitch Profile',
    });
  }

  return filePath;
}

/**
 * List all saved profiles in the app's profiles directory.
 * Returns them sorted newest first.
 */
export async function listSavedProfiles(): Promise<SavedProfileInfo[]> {
  await ensureProfilesDir();

  const files = await FileSystem.readDirectoryAsync(PROFILES_DIR);
  const profiles: SavedProfileInfo[] = [];

  for (const file of files) {
    if (!file.endsWith('.json')) continue;

    try {
      const filePath = PROFILES_DIR + file;
      const content = await FileSystem.readAsStringAsync(filePath);
      const parsed = JSON.parse(content);

      if (parsed.device && parsed.settings) {
        profiles.push({
          fileName: file,
          filePath,
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
 * Load a profile from a specific file path.
 */
export async function loadProfileFromPath(filePath: string): Promise<DeviceProfile> {
  const content = await FileSystem.readAsStringAsync(filePath);
  const parsed = JSON.parse(content);
  return validateAndMigrate(parsed);
}

/**
 * Import a profile from the device file picker.
 * Validates the JSON structure and migrates v1 profiles to v2.
 * Also saves a copy to the profiles directory for future access.
 */
export async function importProfileFromPicker(): Promise<DeviceProfile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/json',
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled) return null;

  const asset = result.assets[0];

  // Size sanity check (10MB max)
  if (asset.size && asset.size > 10 * 1024 * 1024) {
    throw new Error('Profile file too large (max 10MB).');
  }

  const content = await FileSystem.readAsStringAsync(asset.uri);

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('Invalid JSON file. Please select an AfterSwitch profile.');
  }

  const profile = validateAndMigrate(parsed);

  // Save a copy locally so it shows up in the saved profiles list
  await saveProfileLocally(profile);

  return profile;
}

/**
 * Delete a saved profile file.
 */
export async function deleteSavedProfile(filePath: string): Promise<void> {
  await FileSystem.deleteAsync(filePath, { idempotent: true });
}

/**
 * Validate and migrate a parsed profile object.
 * Handles v1 → v2 migration for profiles created by the old scaffold.
 */
function validateAndMigrate(data: any): DeviceProfile {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid profile: not an object.');
  }

  if (!data.device || !data.settings) {
    throw new Error('Invalid profile: missing device or settings.');
  }

  // v1 → v2 migration
  if (data.schemaVersion === 1 || !data.schemaVersion) {
    return migrateV1toV2(data);
  }

  if (data.schemaVersion === 2) {
    return data as DeviceProfile;
  }

  throw new Error(`Unknown schema version: ${data.schemaVersion}`);
}

/**
 * Migrate a v1 profile to v2 format.
 */
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
