import { DeviceProfile } from "../types/profile";

export function buildSampleProfile(): DeviceProfile {
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    device: {
      nickname: "Mike's Samsung",
      manufacturer: "Samsung",
      model: "SM-S921U",
      os: "Android",
      osVersion: "14"
    },
    defaults: {
      keyboard: "Samsung Keyboard",
      browser: "Chrome",
      sms: "Google Messages",
      launcher: "One UI Home"
    },
    settings: {
      system: {
        screen_off_timeout: "60000",
        font_scale: "1.0",
        dark_mode: "on"
      },
      secure: {
        default_input_method: "com.samsung.android.honeyboard/.service.HoneyBoardService",
        show_alternative_characters: "on"
      },
      global: {
        adaptive_battery_management_enabled: "1"
      }
    },
    apps: {
      installedPackages: [
        "com.samsung.android.honeyboard",
        "com.android.chrome",
        "com.google.android.apps.messaging"
      ]
    },
    checklist: [
      {
        id: "keyboard-alt",
        title: "Samsung Keyboard → Show alternative characters",
        expectedValue: "ON",
        status: "manual",
        routeHint: "Settings > General management > Samsung Keyboard settings > Layout"
      },
      {
        id: "screen-timeout",
        title: "Screen timeout",
        expectedValue: "1 minute",
        status: "pending",
        routeHint: "Settings > Display > Screen timeout"
      },
      {
        id: "default-browser",
        title: "Default browser app",
        expectedValue: "Chrome",
        status: "pending",
        routeHint: "Settings > Apps > Choose default apps"
      }
    ]
  };
}
