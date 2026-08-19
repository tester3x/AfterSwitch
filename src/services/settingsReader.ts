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

// ============ TEMPORARY EXPERIMENT — remove after the capability run ======

/** Coarse outcomes of the same-value diagnostic. Never carries a value. */
export type DiagnosticWriteResult =
  | 'permission_missing'
  | 'key_not_present'
  | 'same_value_write_succeeded'
  | 'security_exception'
  | 'system_overrode'
  | 'error';

/** The only namespaces and keys the diagnostic will accept. */
export const DIAGNOSTIC_KEYS = {
  secure: ['long_press_timeout', 'show_ime_with_hard_keyboard', 'spell_checker_enabled'],
  global: ['window_animation_scale', 'transition_animation_scale', 'animator_duration_scale'],
} as const;

export type DiagnosticNamespace = keyof typeof DIAGNOSTIC_KEYS;

/**
 * DEVELOPMENT DIAGNOSTIC. Reads a known key and writes back the exact value
 * it just read, so observable configuration cannot change. Refuses anything
 * off the allowlist and refuses absent keys, so it can never create one.
 *
 * Never called by scan, restore, startup or any background path — the
 * diagnostic screen is its only caller.
 */
export async function diagnosticSameValueWrite(
  namespace: DiagnosticNamespace,
  key: string,
): Promise<DiagnosticWriteResult> {
  if (!isNativeModuleAvailable()) return 'error';
  const allowed: readonly string[] = DIAGNOSTIC_KEYS[namespace];
  // Refuse on the JS side too, so a caller cannot reach the bridge with an
  // arbitrary key even if the native allowlist were ever loosened.
  if (!allowed.includes(key)) return 'error';
  return await DeviceSettings.diagnosticSameValueWrite(namespace, key);
}

// ====== TEMPORARY EXPERIMENT — changed-value round trip ===================

/**
 * Coarse outcomes of the changed-value round trip. Never carries a value,
 * a key, or exception text.
 *
 *   round_trip_succeeded                    changed, verified, restored, verified
 *   key_not_present                         no row existed; nothing was written
 *   change_write_failed_original_intact     the change write was refused
 *   change_not_persisted_original_restored  accepted, but the fresh read disagreed
 *   restore_succeeded_after_test_failure    the test failed; the original is back
 *   restore_failed_stop_immediately         STOP. The journal is still pending.
 *   permission_missing                      not held; nothing was written
 *   error                                   refused or unusable; nothing was written
 */
export type DiagnosticRoundTripResult =
  | 'round_trip_succeeded'
  | 'key_not_present'
  | 'change_write_failed_original_intact'
  | 'change_not_persisted_original_restored'
  | 'restore_succeeded_after_test_failure'
  | 'restore_failed_stop_immediately'
  | 'permission_missing'
  | 'error';

/**
 * Exactly two keys, one per restricted namespace. Both are cosmetic and
 * instantly reversible; neither touches security, accessibility, networking,
 * input method, or device administration.
 */
export const ROUNDTRIP_KEYS = {
  secure: ['long_press_timeout'],
  global: ['window_animation_scale'],
} as const;

/** Outcome of the startup rollback recovery. Presence and result only. */
export type DiagnosticRecoveryResult =
  | 'no_pending_rollback'
  | 'pending_rollback_restored'
  | 'pending_rollback_restore_failed'
  | 'permission_missing'
  | 'error';

/**
 * DEVELOPMENT DIAGNOSTIC. Reads a known key, writes a DIFFERENT valid value,
 * verifies the change through a fresh read, then restores the exact original
 * in a finally path and verifies that too.
 *
 * The native side journals the original to this package's private storage,
 * fsynced, before it mutates anything, so process death cannot strand the
 * setting. Nothing here ever sees the original, the alternate, or the
 * restored value.
 *
 * Never called by scan, restore, startup or any background path — the
 * diagnostic screen is its only caller.
 */
export async function diagnosticRoundTrip(
  namespace: DiagnosticNamespace,
  key: string,
): Promise<DiagnosticRoundTripResult> {
  if (!isNativeModuleAvailable()) return 'error';
  const allowed: readonly string[] = ROUNDTRIP_KEYS[namespace];
  // Refuse on the JS side too, so a caller cannot reach the bridge with an
  // arbitrary key even if the native allowlist were ever loosened.
  if (!allowed.includes(key)) return 'error';
  return await DeviceSettings.diagnosticRoundTrip(namespace, key);
}

/**
 * Finish any rollback left pending by a previous process. MUST run, and MUST
 * report a clean result, before any test button becomes available.
 */
export async function diagnosticRecoverPendingRollback(): Promise<DiagnosticRecoveryResult> {
  // No native module means the recovery cannot be proven to have happened.
  // Fail closed: 'error' blocks the UI rather than silently allowing tests.
  if (!isNativeModuleAvailable()) return 'error';
  return await DeviceSettings.diagnosticRecoverPendingRollback();
}

/** Presence only — never the namespace, key, or value. Fails closed. */
export async function diagnosticRollbackPending(): Promise<boolean> {
  if (!isNativeModuleAvailable()) return true;
  return await DeviceSettings.diagnosticRollbackPending();
}

// ==================== WRITE ====================

export async function writeSystemSetting(key: string, value: string): Promise<boolean> {
  if (!isNativeModuleAvailable()) return false;
  return await DeviceSettings.writeSystemSetting(key, value);
}

export async function writeSecureSetting(key: string, value: string): Promise<boolean> {
  if (!isNativeModuleAvailable()) return false;
  return await DeviceSettings.writeSecureSetting(key, value);
}

export async function writeGlobalSetting(key: string, value: string): Promise<boolean> {
  if (!isNativeModuleAvailable()) return false;
  return await DeviceSettings.writeGlobalSetting(key, value);
}

// ==================== DEEP LINKS ====================

export async function openSettingsScreen(action: string): Promise<void> {
  if (!isNativeModuleAvailable()) return;
  await DeviceSettings.openSettingsScreen(action);
}
