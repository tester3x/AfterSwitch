/**
 * Quick dirty-check: are current device settings the same as a saved profile?
 *
 * Instead of a full scan (~3s), reads just the settings counts + a sample of
 * common settings to detect whether anything meaningful has changed.
 * Returns in <500ms on real devices.
 */

import {
  readSystemSettings,
  readSecureSettings,
  readGlobalSettings,
  isNativeModuleAvailable,
} from './settingsReader';
import type { DeviceProfile } from '../types/profile';

/** Key settings users are most likely to change between scans. */
const SAMPLE_KEYS: { namespace: 'system' | 'secure' | 'global'; key: string }[] = [
  // Display
  { namespace: 'system', key: 'screen_brightness' },
  { namespace: 'system', key: 'screen_off_timeout' },
  { namespace: 'system', key: 'font_scale' },
  // Sound
  { namespace: 'system', key: 'volume_ring' },
  { namespace: 'system', key: 'volume_music' },
  { namespace: 'system', key: 'vibrate_when_ringing' },
  // Connectivity
  { namespace: 'global', key: 'wifi_on' },
  { namespace: 'global', key: 'bluetooth_on' },
  { namespace: 'global', key: 'mobile_data' },
  { namespace: 'global', key: 'airplane_mode_on' },
  // Navigation / Input
  { namespace: 'secure', key: 'default_input_method' },
  { namespace: 'secure', key: 'navigation_mode' },
  // Accessibility
  { namespace: 'secure', key: 'accessibility_display_magnification_enabled' },
  { namespace: 'system', key: 'accelerometer_rotation' },
];

export type QuickCheckResult = {
  /** True if device settings appear unchanged from the profile. */
  settingsMatch: boolean;
  /** How many sample keys were checked. */
  checkedCount: number;
  /** How many sample keys differed. */
  diffCount: number;
};

/**
 * Run a fast comparison between live device settings and a saved profile.
 * Reads 3 namespaces in parallel, then spot-checks ~14 key settings.
 * If the count of settings is significantly different OR sample keys differ,
 * returns settingsMatch: false.
 */
export async function quickSettingsCheck(
  savedProfile: DeviceProfile,
): Promise<QuickCheckResult> {
  if (!isNativeModuleAvailable()) {
    // Can't read device settings — assume they don't match so scan stays active
    return { settingsMatch: false, checkedCount: 0, diffCount: 0 };
  }

  // Read all 3 namespaces in parallel
  const [liveSystem, liveSecure, liveGlobal] = await Promise.all([
    readSystemSettings(),
    readSecureSettings(),
    readGlobalSettings(),
  ]);

  const liveMap: Record<string, Record<string, string>> = {
    system: liveSystem,
    secure: liveSecure,
    global: liveGlobal,
  };

  const savedMap: Record<string, Record<string, string>> = {
    system: savedProfile.settings.system,
    secure: savedProfile.settings.secure,
    global: savedProfile.settings.global,
  };

  // Count check — if the total settings count changed by more than 5%, probably changed
  const liveTotal =
    Object.keys(liveSystem).length +
    Object.keys(liveSecure).length +
    Object.keys(liveGlobal).length;
  const savedTotal =
    Object.keys(savedProfile.settings.system).length +
    Object.keys(savedProfile.settings.secure).length +
    Object.keys(savedProfile.settings.global).length;

  if (Math.abs(liveTotal - savedTotal) > Math.max(savedTotal * 0.05, 3)) {
    return { settingsMatch: false, checkedCount: 0, diffCount: 0 };
  }

  // Sample key check
  let checked = 0;
  let diffs = 0;

  for (const { namespace, key } of SAMPLE_KEYS) {
    const liveVal = liveMap[namespace]?.[key];
    const savedVal = savedMap[namespace]?.[key];

    // Skip keys that don't exist in either — they're not meaningful
    if (liveVal === undefined && savedVal === undefined) continue;

    checked++;
    if (liveVal !== savedVal) {
      diffs++;
    }
  }

  // Allow 1 diff as noise (brightness can drift by 1 etc.)
  const settingsMatch = diffs <= 1;

  return { settingsMatch, checkedCount: checked, diffCount: diffs };
}
