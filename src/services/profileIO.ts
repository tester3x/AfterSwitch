/**
 * Profile import/export via file system and share sheet.
 * Handles schema validation and v1→v2 migration.
 */

import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { DeviceProfile } from '../types/profile';

/**
 * Export profile as JSON file and open the system share sheet.
 * File name includes device model for easy identification.
 */
export async function exportProfileJson(profile: DeviceProfile): Promise<string> {
  const safeName = profile.device.model.replace(/[^a-zA-Z0-9-_]/g, '-');
  const date = new Date().toISOString().split('T')[0];
  const fileName = `afterswitch-${safeName}-${date}.json`;

  const file = new File(Paths.cache, fileName);
  file.write(JSON.stringify(profile, null, 2));

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      dialogTitle: 'Save AfterSwitch Profile',
    });
  }

  return file.uri;
}

/**
 * Import a profile from the device file picker.
 * Validates the JSON structure and migrates v1 profiles to v2.
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

  const importedFile = new File(asset.uri);
  const content = await importedFile.text();

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('Invalid JSON file. Please select an AfterSwitch profile.');
  }

  return validateAndMigrate(parsed);
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
 * Migrate a v1 profile (from ChatGPT scaffold) to v2 format.
 */
function migrateV1toV2(v1: any): DeviceProfile {
  // Convert string defaults to AppDefault objects
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

  // Convert string[] app list to InstalledApp[]
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
