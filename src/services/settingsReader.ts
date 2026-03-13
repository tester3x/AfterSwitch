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

export async function canWriteSecureSettings(): Promise<boolean> {
  if (!isNativeModuleAvailable()) return false;
  return await DeviceSettings.canWriteSecureSettings();
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
