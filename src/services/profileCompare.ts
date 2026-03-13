/**
 * Dynamic profile comparison engine.
 * Iterates ALL settings keys from both profiles and diffs them.
 * Uses the settings registry for metadata (labels, groups, restore types).
 */

import type {
  DeviceProfile,
  ComparisonResult,
  SettingDiff,
  AppDiff,
  SettingGroup,
  AppDefault,
} from '../types/profile';
import { getSettingMeta, GROUP_ORDER } from '../data/settingsRegistry';

/**
 * Compare two device profiles and return all differences.
 */
export function compareProfiles(
  currentProfile: DeviceProfile,
  importedProfile: DeviceProfile
): ComparisonResult {
  const settingDiffs: SettingDiff[] = [];

  // Compare each settings namespace
  const namespaces = ['system', 'secure', 'global', 'samsung'] as const;
  for (const ns of namespaces) {
    const oldSettings = importedProfile.settings[ns] || {};
    const newSettings = currentProfile.settings[ns] || {};

    // Get all unique keys from both profiles
    const allKeys = new Set([
      ...Object.keys(oldSettings),
      ...Object.keys(newSettings),
    ]);

    for (const key of allKeys) {
      const oldVal = oldSettings[key];
      const newVal = newSettings[key];

      // Skip if values are the same
      if (oldVal === newVal) continue;

      // Skip if both are empty/undefined
      if (!oldVal && !newVal) continue;

      const fullKey = `${ns}.${key}`;
      const meta = getSettingMeta(fullKey);

      settingDiffs.push({
        key: fullKey,
        category: ns,
        label: meta.label,
        group: meta.group,
        oldValue: meta.valueFormatter
          ? meta.valueFormatter(oldVal || '')
          : (oldVal || '(not set)'),
        newValue: meta.valueFormatter
          ? meta.valueFormatter(newVal || '')
          : (newVal || '(not set)'),
        restoreType: meta.restoreType,
        settingsIntent: meta.settingsIntent,
        description: meta.description,
        priority: meta.priority,
      });
    }
  }

  // Compare default apps
  const defaultDiffs = compareDefaults(currentProfile.defaults, importedProfile.defaults);
  settingDiffs.push(...defaultDiffs);

  // Sort by priority (lower = more important), then by group order
  settingDiffs.sort((a, b) => {
    const groupDiff = (GROUP_ORDER[a.group] || 99) - (GROUP_ORDER[b.group] || 99);
    if (groupDiff !== 0) return groupDiff;
    return a.priority - b.priority;
  });

  // Compare installed apps
  const appDiffs = compareApps(currentProfile, importedProfile);

  // Build summary
  const autoRestoreCount = settingDiffs.filter((d) => d.restoreType === 'auto').length;
  const guidedCount = settingDiffs.filter((d) => d.restoreType === 'guided').length;
  const infoCount = settingDiffs.filter((d) => d.restoreType === 'info').length;

  return {
    settings: settingDiffs,
    apps: appDiffs,
    summary: {
      totalDiffs: settingDiffs.length + appDiffs.length,
      autoRestoreCount,
      guidedCount,
      infoCount,
      missingApps: appDiffs.filter((a) => a.status === 'missing').length,
    },
  };
}

/**
 * Compare default app handlers between two profiles.
 */
function compareDefaults(
  currentDefaults: Record<string, AppDefault | null>,
  importedDefaults: Record<string, AppDefault | null>
): SettingDiff[] {
  const diffs: SettingDiff[] = [];
  const allKeys = new Set([
    ...Object.keys(currentDefaults || {}),
    ...Object.keys(importedDefaults || {}),
  ]);

  for (const key of allKeys) {
    const oldDefault = importedDefaults?.[key];
    const newDefault = currentDefaults?.[key];

    const oldPkg = oldDefault?.packageName || '';
    const newPkg = newDefault?.packageName || '';

    if (oldPkg === newPkg) continue;

    diffs.push({
      key: `defaults.${key}`,
      category: 'defaults',
      label: `Default ${key}`,
      group: 'defaults',
      oldValue: oldDefault?.label || oldPkg || '(not set)',
      newValue: newDefault?.label || newPkg || '(not set)',
      restoreType: 'guided',
      settingsIntent: 'android.settings.MANAGE_DEFAULT_APPS_SETTINGS',
      priority: 7,
    });
  }

  return diffs;
}

/**
 * Compare installed apps between two profiles.
 */
function compareApps(
  currentProfile: DeviceProfile,
  importedProfile: DeviceProfile
): AppDiff[] {
  const diffs: AppDiff[] = [];
  const currentApps = new Map(
    (currentProfile.apps?.installed || []).map((a) => [a.packageName, a])
  );
  const importedApps = importedProfile.apps?.installed || [];

  for (const oldApp of importedApps) {
    const newApp = currentApps.get(oldApp.packageName);

    if (!newApp) {
      diffs.push({
        packageName: oldApp.packageName,
        label: oldApp.label,
        status: 'missing',
        oldVersion: oldApp.versionName,
        playStoreUrl: `https://play.google.com/store/apps/details?id=${oldApp.packageName}`,
      });
    } else if (
      oldApp.versionName &&
      newApp.versionName &&
      oldApp.versionName !== newApp.versionName
    ) {
      diffs.push({
        packageName: oldApp.packageName,
        label: oldApp.label,
        status: 'version_mismatch',
        oldVersion: oldApp.versionName,
        newVersion: newApp.versionName,
        playStoreUrl: `https://play.google.com/store/apps/details?id=${oldApp.packageName}`,
      });
    }
  }

  return diffs;
}

/**
 * Group setting diffs by their SettingGroup for display.
 */
export function groupDiffs(
  diffs: SettingDiff[]
): Array<{ group: SettingGroup; label: string; diffs: SettingDiff[] }> {
  const grouped = new Map<SettingGroup, SettingDiff[]>();

  for (const diff of diffs) {
    const existing = grouped.get(diff.group) || [];
    existing.push(diff);
    grouped.set(diff.group, existing);
  }

  return Array.from(grouped.entries())
    .map(([group, items]) => ({
      group,
      label: group.charAt(0).toUpperCase() + group.slice(1),
      diffs: items,
    }))
    .sort((a, b) => (GROUP_ORDER[a.group] || 99) - (GROUP_ORDER[b.group] || 99));
}
