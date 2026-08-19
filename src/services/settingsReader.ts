/**
 * JS bridge to the DeviceSettings native module.
 * Wraps all native method calls with proper typing.
 */

import { NativeModules, Platform } from 'react-native';
import type { AppDefault, InstalledApp } from '../types/profile';

const { DeviceSettings } = NativeModules;

/**
 * Check if the native module is available.
 * Returns false in Expo Go or on non-Android platforms.
 */
export function isNativeModuleAvailable(): boolean {
  return Platform.OS === 'android' && DeviceSettings != null;
}

// ==================== READ ====================

export async function readSystemSettings(): Promise<Record<string, string>> {
  if (!isNativeModuleAvailable()) return {};
  return await DeviceSettings.getSystemSettings();
}

export async function readSecureSettings(): Promise<Record<string, string>> {
  if (!isNativeModuleAvailable()) return {};
  return await DeviceSettings.getSecureSettings();
}

export async function readGlobalSettings(): Promise<Record<string, string>> {
  if (!isNativeModuleAvailable()) return {};
  return await DeviceSettings.getGlobalSettings();
}

export async function readSamsungSettings(): Promise<Record<string, string>> {
  if (!isNativeModuleAvailable()) return {};
  return await DeviceSettings.getSamsungSettings();
}

export type DeviceInfo = {
  manufacturer: string;
  brand: string;
  model: string;
  device: string;
  product: string;
  osVersion: string;
  sdkInt: number;
  securityPatch: string;
  display: string;
  deviceName: string;
  oneUiVersion: string | null;
};

export async function readDeviceInfo(): Promise<DeviceInfo> {
  if (!isNativeModuleAvailable()) {
    return {
      manufacturer: 'Unknown',
      brand: 'Unknown',
      model: 'Unknown',
      device: 'unknown',
      product: 'unknown',
      osVersion: '0',
      sdkInt: 0,
      securityPatch: '',
      display: '',
      deviceName: 'Unknown Device',
      oneUiVersion: null,
    };
  }
  return await DeviceSettings.getDeviceInfo();
}

export async function readInstalledApps(includeSystem = false): Promise<InstalledApp[]> {
  if (!isNativeModuleAvailable()) return [];
  return await DeviceSettings.getInstalledApps(includeSystem);
}

export async function readDefaultApps(): Promise<Record<string, AppDefault | null>> {
  if (!isNativeModuleAvailable()) return {};
  return await DeviceSettings.getDefaultApps();
}

// ==================== PERMISSIONS ====================

export async function canWriteSettings(): Promise<boolean> {
  if (!isNativeModuleAvailable()) return false;
  return await DeviceSettings.canWriteSettings();
}

export async function requestWritePermission(): Promise<void> {
  if (!isNativeModuleAvailable()) return;
  await DeviceSettings.requestWritePermission();
}

/**
 * Whether WRITE_SECURE_SETTINGS is HELD. Not whether a restore will work.
 *
 * Android 12+ SettingsProvider can hold the permission and still refuse
 * writes to known system keys, so `true` here means "permitted, capability
 * untested" — never "restore-capable". Use `secureWriteCapability()` when
 * the distinction matters. Proving the second question needs a device
 * experiment, not a code change.
 */
export async function canWriteSecureSettings(): Promise<boolean> {
  if (!isNativeModuleAvailable()) return false;
  return await DeviceSettings.canWriteSecureSettings();
}

/**
 * Tri-state so the two questions can never be conflated:
 *   'not_granted'      — the permission is absent
 *   'granted_untested' — held, but writing a KNOWN key is unproven
 *   'unavailable'      — no native module in this build
 */
export type SecureWriteCapability = 'unavailable' | 'not_granted' | 'granted_untested';

export async function secureWriteCapability(): Promise<SecureWriteCapability> {
  if (!isNativeModuleAvailable()) return 'unavailable';
  return (await DeviceSettings.canWriteSecureSettings())
    ? 'granted_untested'
    : 'not_granted';
}

// ==================== WRITE ====================

/**
 * Coarse native write outcomes. The native module resolves one of these
 * strings and never a value, so a result can be shown or logged without
 * leaking a setting.
 *
 * It used to resolve a boolean, which could not distinguish "refused" from
 * "attempted and did not stick", and `writeSystemSetting` REJECTED on a
 * missing permission — a rejection the caller turned into a generic failure.
 */
export type NativeWriteOutcome =
  | 'write_succeeded'
  | 'write_failed'
  | 'key_not_present'
  | 'not_allowlisted'
  | 'unsupported_value'
  | 'permission_missing';

const OUTCOMES: readonly string[] = [
  'write_succeeded', 'write_failed', 'key_not_present',
  'not_allowlisted', 'unsupported_value', 'permission_missing',
];

/** Anything unrecognised is a failure, never a success. Fails closed. */
function coerceOutcome(raw: unknown): NativeWriteOutcome {
  return (typeof raw === 'string' && OUTCOMES.includes(raw))
    ? (raw as NativeWriteOutcome)
    : 'write_failed';
}

export async function writeSystemSetting(key: string, value: string): Promise<NativeWriteOutcome> {
  if (!isNativeModuleAvailable()) return 'write_failed';
  try {
    return coerceOutcome(await DeviceSettings.writeSystemSetting(key, value));
  } catch {
    return 'write_failed';
  }
}

export async function writeSecureSetting(key: string, value: string): Promise<NativeWriteOutcome> {
  if (!isNativeModuleAvailable()) return 'write_failed';
  try {
    return coerceOutcome(await DeviceSettings.writeSecureSetting(key, value));
  } catch {
    return 'write_failed';
  }
}

export async function writeGlobalSetting(key: string, value: string): Promise<NativeWriteOutcome> {
  if (!isNativeModuleAvailable()) return 'write_failed';
  try {
    return coerceOutcome(await DeviceSettings.writeGlobalSetting(key, value));
  } catch {
    return 'write_failed';
  }
}

// ====== TEMPORARY EXPERIMENT — system-write matrix ========================
//
// Nothing here touches the production restore path. The production allowlist
// in src/data/restoreAllowlist.ts is unchanged; these are the experiment's
// own lists, and the domains they exercise are deliberately the same ones
// the production validator enforces.

/**
 * ROUND 2. Ordered. Index N stays disabled until index N-1 is restored and
 * verified.
 *
 * Keys 1-10 were completed and accepted from build 56a2b326 and are
 * deliberately ABSENT rather than disabled — a key not in this list cannot be
 * run at all, so there is no way to repeat one by accident. The native list
 * mirrors this exactly, asserted by test.
 */
export const MATRIX_ORDER = [
  'global.transition_animation_scale',
  // LAST. A font_scale write is a configuration change and the activity is
  // destroyed and recreated under the running test — the manifest's
  // configChanges mask does not include fontScale. The whole round trip runs
  // inside one native call, and the journal is forced to disk before the
  // mutation, so neither recreation nor process death can strand it.
  'system.font_scale',
] as const;

/** Identity of this diagnostic build. Never a setting value. */
export async function matrixBuildTag(): Promise<string> {
  if (!isNativeModuleAvailable()) return '';
  return await DeviceSettings.matrixBuildTag();
}

/**
 * Coarse results that survive an activity recreation.
 *
 * system.font_scale writes a configuration change, so the activity is
 * destroyed and recreated under the running round trip. The native call is
 * unaffected — it finishes, restores, and clears the journal — but the
 * RESULT used to live only in React state, so the remount wiped it. The one
 * key whose recreation was anticipated was the one key whose outcome could
 * not be read back. The journal had durability; the evidence did not.
 *
 * Keys are `ns.key`; values are coarse codes only, never a setting value.
 * `blocked` is a boolean latch for a restoration failure that must outlive a
 * process restart.
 */
export type MatrixPersistedResults = Record<string, string | boolean>;

export async function matrixPersistedResults(): Promise<MatrixPersistedResults> {
  if (!isNativeModuleAvailable()) return {};
  return await DeviceSettings.matrixPersistedResults();
}

/**
 * The ONLY path that clears results. Refuses while a rollback is pending or
 * a restoration failure is latched — clearing then would erase the record
 * that something still needs finishing.
 */
export async function matrixResetResults(): Promise<'reset' | 'refused_pending' | 'error'> {
  if (!isNativeModuleAvailable()) return 'error';
  return await DeviceSettings.matrixResetResults();
}

/** Non-mutating only. Never written, in any circumstance. */
export const MATRIX_PROBES = [
  'secure.spell_checker_enabled',
  'global.animator_duration_scale',
] as const;

export type MatrixRoundTripResult =
  | 'round_trip_succeeded'
  | 'key_not_present'
  | 'change_write_failed_original_intact'
  | 'change_not_persisted_original_restored'
  | 'restore_succeeded_after_test_failure'
  | 'restore_failed_stop_immediately'
  | 'permission_missing'
  | 'unsupported_value'
  | 'out_of_order'
  | 'error';

export type MatrixProbeResult =
  | 'present_row'
  | 'absent_key_in_public_sdk'
  | 'absent_key_not_in_public_sdk'
  | 'error';

export type MatrixRecoveryResult =
  | 'no_pending_rollback'
  | 'pending_rollback_restored'
  | 'pending_rollback_restore_failed'
  | 'permission_missing'
  | 'error';

/**
 * WRITE_SETTINGS is an APPOP, not a runtime permission, and it is NOT the
 * grant the earlier experiment obtained. `pm grant … WRITE_SECURE_SETTINGS`
 * does nothing for Settings.System. This reports the System capability on
 * its own so the two are never conflated.
 */
export async function canWriteSystemSettings(): Promise<boolean> {
  if (!isNativeModuleAvailable()) return false;
  return await DeviceSettings.canWriteSystemSettings();
}

export async function matrixRoundTrip(fullKey: string): Promise<MatrixRoundTripResult> {
  if (!isNativeModuleAvailable()) return 'error';
  if (!(MATRIX_ORDER as readonly string[]).includes(fullKey)) return 'error';
  return await DeviceSettings.matrixRoundTrip(fullKey);
}

export async function matrixProbePresence(fullKey: string): Promise<MatrixProbeResult> {
  if (!isNativeModuleAvailable()) return 'error';
  if (!(MATRIX_PROBES as readonly string[]).includes(fullKey)) return 'error';
  return await DeviceSettings.matrixProbePresence(fullKey);
}

/** Must run, and report clean, before any test control renders. */
export async function matrixRecoverPendingRollback(): Promise<MatrixRecoveryResult> {
  if (!isNativeModuleAvailable()) return 'error';
  return await DeviceSettings.matrixRecoverPendingRollback();
}

/** Presence only — never the namespace, key, or value. Fails closed. */
export async function matrixRollbackPending(): Promise<boolean> {
  if (!isNativeModuleAvailable()) return true;
  return await DeviceSettings.matrixRollbackPending();
}

/** Index of the next key permitted to run. Ordering state, not a value. */
export async function matrixNextAllowedIndex(): Promise<number> {
  if (!isNativeModuleAvailable()) return MATRIX_ORDER.length;
  return await DeviceSettings.matrixNextAllowedIndex();
}

// ==================== DEEP LINKS ====================

export async function openSettingsScreen(action: string): Promise<void> {
  if (!isNativeModuleAvailable()) return;
  await DeviceSettings.openSettingsScreen(action);
}
