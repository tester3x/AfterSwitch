/**
 * Same-device restore contracts.
 *
 * Matching model + nickname identifies the phone. It does not mean the
 * settings are equal, and it does not authorize replacing a selected
 * restore baseline with a fresh scan.
 *
 * These helpers exist so production and the regression suite share one
 * implementation. They add no new write path and no diagnostic bypass.
 */

import type { ComparisonResult, DeviceProfile } from '../types/profile';
import { compareProfiles } from './profileCompare';

/**
 * Compare the live profile to the imported restore baseline by content.
 *
 * Never short-circuits on device identity. Identical settings and apps
 * produce zero diffs naturally inside compareProfiles. Differing settings
 * on the same phone are returned and classified by the allowlist.
 */
export function compareSelectedProfiles(
  currentProfile: DeviceProfile,
  importedProfile: DeviceProfile,
): ComparisonResult {
  return compareProfiles(currentProfile, importedProfile);
}

export type FreshScanResult = {
  current: DeviceProfile;
  imported: DeviceProfile | null;
};

/**
 * A scan updates the live/current profile only.
 *
 * The imported backup is an immutable comparison baseline until the user
 * explicitly replaces or clears it. Same model and nickname must not
 * collapse that baseline into the fresh scan.
 */
export function applyFreshScan(
  imported: DeviceProfile | null,
  fresh: DeviceProfile,
): FreshScanResult {
  return { current: fresh, imported };
}

/** True only when the caller must write STORAGE_KEY_IMPORTED after a scan. */
export function shouldPersistImportedAfterScan(): boolean {
  return false;
}
