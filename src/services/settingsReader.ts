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

// ==================== DEEP LINKS ====================

export async function openSettingsScreen(action: string): Promise<void> {
  if (!isNativeModuleAvailable()) return;
  await DeviceSettings.openSettingsScreen(action);
}
