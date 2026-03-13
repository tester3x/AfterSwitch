/**
 * Profile builder — assembles a full DeviceProfile from native module data.
 * Falls back to sample data when native module is unavailable (Expo Go / dev).
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

export type ScanCallback = (progress: ScanProgress) => void;

/**
 * Build a real device profile by scanning all settings providers.
 * Reports progress via callback for UI updates.
 */
export async function buildProfile(onProgress?: ScanCallback): Promise<DeviceProfile> {
  if (!isNativeModuleAvailable()) {
    return buildSampleProfile();
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

/**
 * Sample profile for development/testing when native module isn't available.
 */
export function buildSampleProfile(): DeviceProfile {
  return {
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    exportedBy: 'AfterSwitch v0.2.0 (sample)',
    device: {
      nickname: 'Galaxy S24 Ultra (Sample)',
      manufacturer: 'samsung',
      brand: 'samsung',
      model: 'SM-S928U',
      os: 'Android',
      osVersion: '14',
      sdkInt: 34,
      securityPatch: '2026-02-01',
      oneUiVersion: '6.1',
    },
    defaults: {
      keyboard: { packageName: 'com.samsung.android.honeyboard', label: 'Samsung Keyboard' },
      browser: { packageName: 'com.android.chrome', label: 'Chrome' },
      sms: { packageName: 'com.google.android.apps.messaging', label: 'Messages' },
      launcher: { packageName: 'com.sec.android.app.launcher', label: 'One UI Home' },
      camera: { packageName: 'com.sec.android.app.camera', label: 'Camera' },
      dialer: { packageName: 'com.samsung.android.dialer', label: 'Phone' },
    },
    settings: {
      system: {
        screen_off_timeout: '60000',
        font_scale: '1.0',
        accelerometer_rotation: '1',
        haptic_feedback_enabled: '1',
        sound_effects_enabled: '1',
        volume_ring: '11',
        volume_notification: '7',
        volume_alarm: '10',
        volume_music: '8',
      },
      secure: {
        default_input_method: 'com.samsung.android.honeyboard/.service.HoneyBoardService',
        enabled_accessibility_services: '',
        long_press_timeout: '400',
        navigation_mode: '2',
        spell_checker_enabled: '1',
      },
      global: {
        adb_enabled: '1',
        stay_on_while_plugged_in: '0',
        animator_duration_scale: '1.0',
        transition_animation_scale: '1.0',
        window_animation_scale: '1.0',
        auto_time: '1',
        wifi_on: '1',
        bluetooth_on: '1',
      },
      samsung: {
        navigation_mode: '2',
        show_button_background: '0',
        samsung_keyboard_show_alt_chars: '1',
        edge_enable: '1',
        smart_stay: '0',
        multi_window_enabled: '1',
      },
    },
    apps: {
      installed: [
        { packageName: 'com.samsung.android.honeyboard', label: 'Samsung Keyboard', versionName: '5.8.00.5', isSystemApp: false },
        { packageName: 'com.android.chrome', label: 'Chrome', versionName: '122.0.6261.64', isSystemApp: false },
        { packageName: 'com.google.android.apps.messaging', label: 'Messages', versionName: '20240205', isSystemApp: false },
        { packageName: 'com.whatsapp', label: 'WhatsApp', versionName: '2.24.5.12', isSystemApp: false },
        { packageName: 'com.spotify.music', label: 'Spotify', versionName: '8.9.10.612', isSystemApp: false },
      ],
    },
  };
}
