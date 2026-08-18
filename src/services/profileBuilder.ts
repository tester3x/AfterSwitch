/**
 * Profile builder — assembles a full DeviceProfile from native module data.
 *
 * Refuses when the native module is unavailable. There is no sample or demo
 * fallback: a profile either describes the real device or does not exist.
 */

import type { DeviceProfile, ScanProgress } from '../types/profile';
import {
  isNativeModuleAvailable,
  readSystemSettings,
  readSecureSettings,
  readGlobalSettings,
  readSamsungSettings,
  readDeviceInfo,
  readInstalledApps,
  readDefaultApps,
} from './settingsReader';

/**
 * Thrown when a scan is attempted without the native capture module.
 *
 * This is the honest outcome in Expo Go, on a non-Android platform, or in
 * any build lacking the config plugin. Previously this case silently
 * returned fabricated sample data.
 */
export class NativeCaptureUnavailableError extends Error {
  readonly code = 'native_capture_unavailable';
  constructor() {
    super(
      'Device capture is unavailable in this build. Scanning reads Android settings through a native module, which requires a development or release build of AfterSwitch — it cannot run in Expo Go.',
    );
    this.name = 'NativeCaptureUnavailableError';
  }
}

export type ScanCallback = (progress: ScanProgress) => void;

/**
 * Build a real device profile by scanning all settings providers.
 * Reports progress via callback for UI updates.
 */
export async function buildProfile(onProgress?: ScanCallback): Promise<DeviceProfile> {
  // No silent sample data. A scan either reads the real device or refuses.
  // Fabricating a profile here meant a "successful" scan could produce a
  // Galaxy S24 Ultra snapshot on a device that was never read, and nothing
  // downstream could tell it from a real one.
  if (!isNativeModuleAvailable()) {
    throw new NativeCaptureUnavailableError();
  }

  const progress: ScanProgress = {
    system: false,
    secure: false,
    global: false,
    samsung: false,
    device: false,
    apps: false,
    defaults: false,
  };

  // Read device info first (fastest)
  const deviceInfo = await readDeviceInfo();
  progress.device = true;
  onProgress?.(progress);

  // Read all settings providers in parallel
  const [system, secure, global, samsung] = await Promise.all([
    readSystemSettings(),
    readSecureSettings(),
    readGlobalSettings(),
    readSamsungSettings(),
  ]);
  progress.system = true;
  progress.secure = true;
  progress.global = true;
  progress.samsung = true;
  onProgress?.(progress);

  // Read apps and defaults
  const [installedApps, defaults] = await Promise.all([
    readInstalledApps(false),
    readDefaultApps(),
  ]);
  progress.apps = true;
  progress.defaults = true;
  onProgress?.(progress);

  return {
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    exportedBy: 'AfterSwitch v0.2.0',
    device: {
      nickname: deviceInfo.deviceName || deviceInfo.model,
      manufacturer: deviceInfo.manufacturer,
      brand: deviceInfo.brand,
      model: deviceInfo.model,
      os: 'Android',
      osVersion: deviceInfo.osVersion,
      sdkInt: deviceInfo.sdkInt,
      securityPatch: deviceInfo.securityPatch,
      oneUiVersion: deviceInfo.oneUiVersion,
    },
    defaults,
    settings: { system, secure, global, samsung },
    apps: { installed: installedApps },
  };
}

// buildSampleProfile() was REMOVED. It existed only as the silent fallback
// above. Rather than keep a demo path that would then need labelling plus
// export, upload and restore blocking to stay safe, the whole simulation
// surface is gone: no code path can fabricate a DeviceProfile.
