/**
 * Settings Registry — maps raw Android setting keys to human-readable metadata.
 *
 * This is the "brain" that transforms "screen_off_timeout=60000" into
 * "Screen timeout: 1 minute" with group "Display" and intent ACTION_DISPLAY_SETTINGS.
 *
 * Three tiers:
 * 1. Curated entries (this file) — full metadata for ~60 most important settings
 * 2. Pattern-matched — auto-categorized by key name patterns
 * 3. Fallback — humanized key name, "other" group
 */

import type { SettingGroup, RestoreType } from '../types/profile';

export type SettingMeta = {
  label: string;
  group: SettingGroup;
  description?: string;
  restoreType: RestoreType;
  settingsIntent?: string;
  samsungIntent?: string;
  valueFormatter?: (raw: string) => string;
  priority: number;
  samsungOnly?: boolean;
  steps?: string[];
  samsungSteps?: string[];
};

// ==================== VALUE FORMATTERS ====================

function formatMillisToReadable(ms: string): string {
  const val = parseInt(ms, 10);
  if (isNaN(val)) return ms;
  if (val < 60000) return `${val / 1000} seconds`;
  if (val < 3600000) return `${val / 60000} minute${val > 60000 ? 's' : ''}`;
  return `${val / 3600000} hour${val > 3600000 ? 's' : ''}`;
}

function formatFontScale(scale: string): string {
  const val = parseFloat(scale);
  if (isNaN(val)) return scale;
  return `${Math.round(val * 100)}%`;
}

function formatOnOff(val: string): string {
  return val === '1' || val === 'on' ? 'ON' : 'OFF';
}

function formatNavigationMode(val: string): string {
  switch (val) {
    case '0': return 'Three-button';
    case '1': return 'Two-button';
    case '2': return 'Gesture navigation';
    default: return val;
  }
}

function formatAnimationScale(val: string): string {
  const num = parseFloat(val);
  if (num === 0) return 'Off';
  return `${num}x`;
}

function formatComponentToAppName(val: string): string {
  // "com.samsung.android.honeyboard/.service.HoneyBoardService" → package name
  const pkg = val.split('/')[0];
  // Common known packages
  const known: Record<string, string> = {
    'com.samsung.android.honeyboard': 'Samsung Keyboard',
    'com.google.android.inputmethod.latin': 'Gboard',
    'com.swiftkey.swiftkeyloader': 'SwiftKey',
    'com.android.chrome': 'Chrome',
    'com.sec.android.app.sbrowser': 'Samsung Internet',
  };
  return known[pkg] || pkg;
}

/**
 * Smart value formatter for settings without curated formatters.
 * Handles the most common patterns so users don't see raw "0"/"1".
 */
function formatSmartValue(val: string): string {
  // Boolean 0/1 → OFF/ON (the #1 complaint from users)
  if (val === '0') return 'OFF';
  if (val === '1') return 'ON';
  // Component names (com.foo.bar/...) → friendly app name
  if (val.includes('/') && val.includes('.')) return formatComponentToAppName(val);
  // Package names without slash (com.foo.bar) → just the last segment
  if (val.startsWith('com.') && !val.includes(' ')) {
    const parts = val.split('.');
    return parts[parts.length - 1].charAt(0).toUpperCase() + parts[parts.length - 1].slice(1);
  }
  return val;
}

// ==================== SETTINGS INTENTS ====================

export const SETTINGS_INTENTS = {
  DISPLAY: 'android.settings.DISPLAY_SETTINGS',
  SOUND: 'android.settings.SOUND_SETTINGS',
  KEYBOARD: 'android.settings.INPUT_METHOD_SETTINGS',
  ACCESSIBILITY: 'android.settings.ACCESSIBILITY_SETTINGS',
  BLUETOOTH: 'android.settings.BLUETOOTH_SETTINGS',
  WIFI: 'android.settings.WIFI_SETTINGS',
  BATTERY: 'android.settings.BATTERY_SAVER_SETTINGS',
  DEFAULT_APPS: 'android.settings.MANAGE_DEFAULT_APPS_SETTINGS',
  DATE: 'android.settings.DATE_SETTINGS',
  LOCALE: 'android.settings.LOCALE_SETTINGS',
  SECURITY: 'android.settings.SECURITY_SETTINGS',
  LOCATION: 'android.settings.LOCATION_SOURCE_SETTINGS',
  DEVELOPER: 'android.settings.APPLICATION_DEVELOPMENT_SETTINGS',
  NOTIFICATION: 'android.settings.NOTIFICATION_SETTINGS',
  GENERAL: 'android.settings.SETTINGS',
} as const;

// ==================== CURATED REGISTRY ====================

export const SETTINGS_REGISTRY: Record<string, SettingMeta> = {
  // ---- Display ----
  'system.screen_off_timeout': {
    label: 'Screen timeout',
    group: 'display',
    description: 'Time before screen turns off automatically',
    restoreType: 'auto',
    settingsIntent: SETTINGS_INTENTS.DISPLAY,
    valueFormatter: formatMillisToReadable,
    priority: 10,
  },
  'system.font_scale': {
    label: 'Font size',
    group: 'display',
    restoreType: 'auto',
    settingsIntent: SETTINGS_INTENTS.DISPLAY,
    valueFormatter: formatFontScale,
    priority: 12,
  },
  'system.accelerometer_rotation': {
    label: 'Auto-rotate screen',
    group: 'display',
    restoreType: 'auto',
    settingsIntent: SETTINGS_INTENTS.DISPLAY,
    valueFormatter: formatOnOff,
    priority: 15,
  },
  'system.screen_brightness_mode': {
    label: 'Adaptive brightness',
    group: 'display',
    restoreType: 'auto',
    settingsIntent: SETTINGS_INTENTS.DISPLAY,
    valueFormatter: formatOnOff,
    priority: 14,
  },

  // ---- Sound ----
  'system.volume_ring': {
    label: 'Ringtone volume',
    group: 'sound',
    restoreType: 'auto',
    settingsIntent: SETTINGS_INTENTS.SOUND,
    priority: 20,
  },
  'system.volume_notification': {
    label: 'Notification volume',
    group: 'sound',
    restoreType: 'auto',
    settingsIntent: SETTINGS_INTENTS.SOUND,
    priority: 21,
  },
  'system.volume_alarm': {
    label: 'Alarm volume',
    group: 'sound',
    restoreType: 'auto',
    settingsIntent: SETTINGS_INTENTS.SOUND,
    priority: 22,
  },
  'system.volume_music': {
    label: 'Media volume',
    group: 'sound',
    restoreType: 'auto',
    settingsIntent: SETTINGS_INTENTS.SOUND,
    priority: 23,
  },
  'system.haptic_feedback_enabled': {
    label: 'Haptic feedback',
    group: 'sound',
    restoreType: 'auto',
    settingsIntent: SETTINGS_INTENTS.SOUND,
    valueFormatter: formatOnOff,
    priority: 25,
  },
  'system.sound_effects_enabled': {
    label: 'Touch sounds',
    group: 'sound',
    restoreType: 'auto',
    settingsIntent: SETTINGS_INTENTS.SOUND,
    valueFormatter: formatOnOff,
    priority: 26,
  },

  // ---- Keyboard ----
  'secure.default_input_method': {
    label: 'Default keyboard',
    group: 'keyboard',
    description: 'The keyboard app used for text input',
    restoreType: 'guided',
    settingsIntent: SETTINGS_INTENTS.KEYBOARD,
    valueFormatter: formatComponentToAppName,
    priority: 5,
    steps: [
      'Scroll to "Keyboard" or "On-screen keyboard"',
      'Tap "Default keyboard" or "Current keyboard"',
      'Select your preferred keyboard from the list',
    ],
    samsungSteps: [
      'Tap "General management"',
      'Tap "Keyboard list and default"',
      'Tap "Default keyboard"',
      'Select your preferred keyboard',
    ],
  },
  'secure.spell_checker_enabled': {
    label: 'Spell checker',
    group: 'keyboard',
    restoreType: 'guided',
    settingsIntent: SETTINGS_INTENTS.KEYBOARD,
    valueFormatter: formatOnOff,
    priority: 30,
    steps: [
      'Scroll to "Keyboard" or "On-screen keyboard"',
      'Find the "Spell checker" toggle',
      'Toggle it to match your old phone',
    ],
    samsungSteps: [
      'Tap "General management"',
      'Tap "Keyboard list and default"',
      'Scroll to "Spell checker"',
      'Toggle to match your old phone',
    ],
  },
  'secure.show_ime_with_hard_keyboard': {
    label: 'Show on-screen keyboard with hardware keyboard',
    group: 'keyboard',
    restoreType: 'guided',
    settingsIntent: SETTINGS_INTENTS.KEYBOARD,
    valueFormatter: formatOnOff,
    priority: 35,
    steps: [
      'Scroll to "Physical keyboard"',
      'Toggle "Show on-screen keyboard"',
    ],
    samsungSteps: [
      'Tap "General management"',
      'Tap "Physical keyboard"',
      'Toggle "Show on-screen keyboard"',
    ],
  },

  // ---- Navigation ----
  'secure.navigation_mode': {
    label: 'Navigation mode',
    group: 'navigation',
    description: 'Gesture navigation vs button navigation',
    restoreType: 'guided',
    settingsIntent: SETTINGS_INTENTS.DISPLAY,
    valueFormatter: formatNavigationMode,
    priority: 8,
    steps: [
      'Tap "Gestures" or "System navigation"',
      'Select "Gesture navigation" or "3-button navigation"',
    ],
    samsungSteps: [
      'Tap "Navigation bar"',
      'Choose "Buttons" or "Swipe gestures"',
    ],
  },

  // ---- Accessibility ----
  'secure.enabled_accessibility_services': {
    label: 'Accessibility services',
    group: 'accessibility',
    restoreType: 'guided',
    settingsIntent: SETTINGS_INTENTS.ACCESSIBILITY,
    priority: 40,
    steps: [
      'Scroll through the list of installed services',
      'Tap on the service you want to enable',
      'Toggle it ON and confirm the permission dialog',
    ],
  },
  'secure.long_press_timeout': {
    label: 'Touch and hold delay',
    group: 'accessibility',
    restoreType: 'guided',
    settingsIntent: SETTINGS_INTENTS.ACCESSIBILITY,
    valueFormatter: (v) => `${parseInt(v, 10)}ms`,
    priority: 42,
    steps: [
      'Scroll to "Touch and hold delay"',
      'Select Short, Medium, or Long to match your old phone',
    ],
    samsungSteps: [
      'Tap "Interaction and dexterity"',
      'Tap "Touch and hold delay"',
      'Select the matching duration',
    ],
  },

  // ---- Connectivity ----
  'global.wifi_on': {
    label: 'Wi-Fi',
    group: 'connectivity',
    restoreType: 'info',
    settingsIntent: SETTINGS_INTENTS.WIFI,
    valueFormatter: formatOnOff,
    priority: 50,
  },
  'global.bluetooth_on': {
    label: 'Bluetooth',
    group: 'connectivity',
    restoreType: 'info',
    settingsIntent: SETTINGS_INTENTS.BLUETOOTH,
    valueFormatter: formatOnOff,
    priority: 51,
  },
  'global.auto_time': {
    label: 'Automatic date & time',
    group: 'connectivity',
    restoreType: 'guided',
    settingsIntent: SETTINGS_INTENTS.DATE,
    valueFormatter: formatOnOff,
    priority: 55,
    steps: [
      'Find "Automatic date & time" or "Set time automatically"',
      'Toggle it to match your old phone',
    ],
    samsungSteps: [
      'Tap "General management"',
      'Tap "Date and time"',
      'Toggle "Automatic date and time"',
    ],
  },

  // ---- Developer Options ----
  'global.adb_enabled': {
    label: 'USB debugging',
    group: 'security',
    restoreType: 'guided',
    settingsIntent: SETTINGS_INTENTS.DEVELOPER,
    valueFormatter: formatOnOff,
    priority: 60,
    steps: [
      'If Developer Options is not visible, go to About Phone and tap Build Number 7 times',
      'Open Developer Options',
      'Scroll to "USB debugging"',
      'Toggle to match your old phone',
    ],
  },
  'global.animator_duration_scale': {
    label: 'Animator duration scale',
    group: 'display',
    restoreType: 'guided',
    settingsIntent: SETTINGS_INTENTS.DEVELOPER,
    valueFormatter: formatAnimationScale,
    priority: 65,
    steps: [
      'If Developer Options is not visible, go to About Phone and tap Build Number 7 times',
      'Open Developer Options',
      'Scroll to "Animator duration scale"',
      'Select the matching value',
    ],
  },
  'global.transition_animation_scale': {
    label: 'Transition animation scale',
    group: 'display',
    restoreType: 'guided',
    settingsIntent: SETTINGS_INTENTS.DEVELOPER,
    valueFormatter: formatAnimationScale,
    priority: 66,
    steps: [
      'If Developer Options is not visible, go to About Phone and tap Build Number 7 times',
      'Open Developer Options',
      'Scroll to "Transition animation scale"',
      'Select the matching value',
    ],
  },
  'global.window_animation_scale': {
    label: 'Window animation scale',
    group: 'display',
    restoreType: 'guided',
    settingsIntent: SETTINGS_INTENTS.DEVELOPER,
    valueFormatter: formatAnimationScale,
    priority: 67,
    steps: [
      'If Developer Options is not visible, go to About Phone and tap Build Number 7 times',
      'Open Developer Options',
      'Scroll to "Window animation scale"',
      'Select the matching value',
    ],
  },
  'global.stay_on_while_plugged_in': {
    label: 'Stay awake while charging',
    group: 'display',
    restoreType: 'guided',
    settingsIntent: SETTINGS_INTENTS.DEVELOPER,
    valueFormatter: formatOnOff,
    priority: 68,
    steps: [
      'If Developer Options is not visible, go to About Phone and tap Build Number 7 times',
      'Open Developer Options',
      'Scroll to "Stay awake"',
      'Toggle to match your old phone',
    ],
  },

  // ---- Samsung-specific ----
  'samsung.samsung_keyboard_show_alt_chars': {
    label: 'Samsung Keyboard: Show alternative characters',
    group: 'samsung',
    description: 'Show @#$% on long-hold instead of accent marks',
    restoreType: 'guided',
    settingsIntent: 'com.samsung.android.honeyboard.SETTINGS',
    priority: 1,
    samsungOnly: true,
    samsungSteps: [
      'Tap "Languages and types"',
      'Tap your active keyboard language',
      'Look for "Alternative characters"',
      'Toggle to match your old phone',
    ],
  },
  'samsung.navigation_mode': {
    label: 'Navigation mode (Samsung)',
    group: 'samsung',
    restoreType: 'guided',
    settingsIntent: SETTINGS_INTENTS.DISPLAY,
    valueFormatter: formatNavigationMode,
    priority: 3,
    samsungOnly: true,
    samsungSteps: [
      'Tap "Navigation bar"',
      'Choose "Buttons" or "Swipe gestures"',
      'If using gestures, configure sensitivity if desired',
    ],
  },
  'samsung.edge_enable': {
    label: 'Edge panels',
    group: 'samsung',
    restoreType: 'guided',
    settingsIntent: SETTINGS_INTENTS.DISPLAY,
    valueFormatter: formatOnOff,
    priority: 45,
    samsungOnly: true,
    samsungSteps: [
      'Scroll to "Edge panels"',
      'Toggle Edge panels ON or OFF to match your old phone',
    ],
  },
  'samsung.smart_stay': {
    label: 'Smart Stay',
    group: 'samsung',
    description: 'Screen stays on while you look at it',
    restoreType: 'guided',
    settingsIntent: SETTINGS_INTENTS.DISPLAY,
    valueFormatter: formatOnOff,
    priority: 46,
    samsungOnly: true,
    samsungSteps: [
      'Go to "Motions and gestures" or "Advanced features"',
      'Find "Smart Stay" or "Keep screen on while viewing"',
      'Toggle to match your old phone',
    ],
  },
  'samsung.multi_window_enabled': {
    label: 'Multi window',
    group: 'samsung',
    restoreType: 'guided',
    settingsIntent: SETTINGS_INTENTS.DISPLAY,
    valueFormatter: formatOnOff,
    priority: 47,
    samsungOnly: true,
    samsungSteps: [
      'Go to Display or Advanced features',
      'Find "Multi window"',
      'Toggle to match your old phone',
    ],
  },
  'samsung.show_button_background': {
    label: 'Show button background',
    group: 'samsung',
    restoreType: 'guided',
    settingsIntent: SETTINGS_INTENTS.ACCESSIBILITY,
    valueFormatter: formatOnOff,
    priority: 48,
    samsungOnly: true,
    samsungSteps: [
      'Tap "Visibility enhancements"',
      'Find "Show button shapes" or "Button backgrounds"',
      'Toggle to match your old phone',
    ],
  },

  // ---- Samsung AOD (Always On Display) ----
  'samsung.aod_mode': {
    label: 'Always On Display mode',
    group: 'samsung',
    description: 'Controls when Always On Display is shown (always, tap, scheduled)',
    restoreType: 'guided',
    settingsIntent: 'com.samsung.android.app.aodservice/.AODSettingsActivity',
    priority: 10,
    samsungOnly: true,
    samsungSteps: [
      'Open Settings > Lock screen',
      'Tap "Always On Display"',
      'Choose when to show: Tap to show, Show always, or Show as scheduled',
    ],
  },
  'samsung.aod_tap_to_show_mode': {
    label: 'Always On Display - Tap to show',
    group: 'samsung',
    description: 'Show the clock and notifications when you tap the screen',
    restoreType: 'guided',
    settingsIntent: 'com.samsung.android.app.aodservice/.AODSettingsActivity',
    valueFormatter: formatOnOff,
    priority: 11,
    samsungOnly: true,
    samsungSteps: [
      'Open Settings > Lock screen',
      'Tap "Always On Display"',
      'Select "Tap to show" mode',
    ],
  },
  'samsung.aod_clock_style': {
    label: 'Always On Display clock style',
    group: 'samsung',
    restoreType: 'guided',
    settingsIntent: 'com.samsung.android.app.aodservice/.AODSettingsActivity',
    priority: 12,
    samsungOnly: true,
    samsungSteps: [
      'Open Settings > Lock screen',
      'Tap "Always On Display"',
      'Tap "Clock style"',
      'Choose the clock that matches your old phone',
    ],
  },
  'samsung.aod_show_on_charging': {
    label: 'Always On Display while charging',
    group: 'samsung',
    restoreType: 'guided',
    settingsIntent: 'com.samsung.android.app.aodservice/.AODSettingsActivity',
    valueFormatter: formatOnOff,
    priority: 13,
    samsungOnly: true,
    samsungSteps: [
      'Open Settings > Lock screen',
      'Tap "Always On Display"',
      'Look for "Show while charging" or similar option',
      'Toggle to match your old phone',
    ],
  },

  // ---- Samsung Display ----
  'samsung.blue_light_filter': {
    label: 'Blue light filter (Eye comfort shield)',
    group: 'samsung',
    restoreType: 'guided',
    settingsIntent: SETTINGS_INTENTS.DISPLAY,
    valueFormatter: formatOnOff,
    priority: 14,
    samsungOnly: true,
    samsungSteps: [
      'Open Settings > Display',
      'Tap "Eye comfort shield"',
      'Toggle it ON or OFF to match your old phone',
    ],
  },
  'samsung.dark_mode': {
    label: 'Dark mode',
    group: 'samsung',
    restoreType: 'guided',
    settingsIntent: SETTINGS_INTENTS.DISPLAY,
    valueFormatter: formatOnOff,
    priority: 15,
    samsungOnly: true,
    samsungSteps: [
      'Open Settings > Display',
      'Toggle "Dark mode" or "Light mode" at the top',
    ],
  },
  'samsung.screen_mode': {
    label: 'Screen mode (Vivid / Natural)',
    group: 'samsung',
    restoreType: 'guided',
    settingsIntent: SETTINGS_INTENTS.DISPLAY,
    priority: 16,
    samsungOnly: true,
    samsungSteps: [
      'Open Settings > Display',
      'Tap "Screen mode"',
      'Choose "Vivid" or "Natural" to match your old phone',
    ],
  },
  'samsung.adaptive_brightness': {
    label: 'Adaptive brightness',
    group: 'samsung',
    restoreType: 'guided',
    settingsIntent: SETTINGS_INTENTS.DISPLAY,
    valueFormatter: formatOnOff,
    priority: 17,
    samsungOnly: true,
    samsungSteps: [
      'Open Settings > Display',
      'Toggle "Adaptive brightness"',
    ],
  },

  // ---- Samsung Advanced features ----
  'samsung.motion_wake_up': {
    label: 'Lift to wake',
    group: 'samsung',
    description: 'Screen turns on when you pick up the phone',
    restoreType: 'guided',
    settingsIntent: 'android.settings.DISPLAY_SETTINGS',
    valueFormatter: formatOnOff,
    priority: 20,
    samsungOnly: true,
    samsungSteps: [
      'Open Settings > Advanced features',
      'Tap "Motions and gestures"',
      'Toggle "Lift to wake"',
    ],
  },
  'samsung.double_tap_to_wake': {
    label: 'Double tap to wake',
    group: 'samsung',
    restoreType: 'guided',
    settingsIntent: 'android.settings.DISPLAY_SETTINGS',
    valueFormatter: formatOnOff,
    priority: 21,
    samsungOnly: true,
    samsungSteps: [
      'Open Settings > Advanced features',
      'Tap "Motions and gestures"',
      'Toggle "Double tap to turn on screen"',
    ],
  },
  'samsung.double_tap_to_sleep': {
    label: 'Double tap to sleep',
    group: 'samsung',
    restoreType: 'guided',
    settingsIntent: 'android.settings.DISPLAY_SETTINGS',
    valueFormatter: formatOnOff,
    priority: 22,
    samsungOnly: true,
    samsungSteps: [
      'Open Settings > Advanced features',
      'Tap "Motions and gestures"',
      'Toggle "Double tap to turn off screen"',
    ],
  },
  'samsung.palm_motion': {
    label: 'Palm swipe to capture',
    group: 'samsung',
    description: 'Take a screenshot by swiping your palm across the screen',
    restoreType: 'guided',
    settingsIntent: 'android.settings.DISPLAY_SETTINGS',
    valueFormatter: formatOnOff,
    priority: 23,
    samsungOnly: true,
    samsungSteps: [
      'Open Settings > Advanced features',
      'Tap "Motions and gestures"',
      'Toggle "Palm swipe to capture"',
    ],
  },
  'samsung.one_hand_mode': {
    label: 'One-handed mode',
    group: 'samsung',
    restoreType: 'guided',
    settingsIntent: 'android.settings.DISPLAY_SETTINGS',
    valueFormatter: formatOnOff,
    priority: 24,
    samsungOnly: true,
    samsungSteps: [
      'Open Settings > Advanced features',
      'Tap "One-handed mode"',
      'Toggle ON and choose Gesture or Button activation',
    ],
  },

  // ---- Samsung Lock Screen ----
  'samsung.lock_screen_show_notifications': {
    label: 'Lock screen notifications',
    group: 'samsung',
    restoreType: 'guided',
    settingsIntent: SETTINGS_INTENTS.NOTIFICATION,
    valueFormatter: formatOnOff,
    priority: 30,
    samsungOnly: true,
    samsungSteps: [
      'Open Settings > Lock screen',
      'Tap "Notifications"',
      'Toggle notification visibility and choose detail level',
    ],
  },

  // ---- Samsung Sound ----
  'samsung.vibration_intensity': {
    label: 'Vibration intensity',
    group: 'samsung',
    restoreType: 'guided',
    settingsIntent: SETTINGS_INTENTS.SOUND,
    priority: 35,
    samsungOnly: true,
    samsungSteps: [
      'Open Settings > Sounds and vibration',
      'Tap "Vibration intensity"',
      'Adjust sliders for Call, Notification, and System to match your old phone',
    ],
  },
  'samsung.system_sound': {
    label: 'System sounds',
    group: 'samsung',
    restoreType: 'guided',
    settingsIntent: SETTINGS_INTENTS.SOUND,
    valueFormatter: formatOnOff,
    priority: 36,
    samsungOnly: true,
    samsungSteps: [
      'Open Settings > Sounds and vibration',
      'Tap "System sound/vibration control"',
      'Toggle individual sounds to match your old phone',
    ],
  },
};

// ==================== PATTERN-BASED CATEGORIZATION ====================

const GROUP_PATTERNS: Array<{ patterns: string[]; group: SettingGroup }> = [
  { patterns: ['volume', 'sound', 'ring', 'vibrat', 'dtmf', 'haptic'], group: 'sound' },
  { patterns: ['display', 'screen', 'bright', 'font', 'dark_mode', 'night_mode', 'theme'], group: 'display' },
  { patterns: ['keyboard', 'input', 'ime', 'spell'], group: 'keyboard' },
  { patterns: ['bluetooth', 'wifi', 'nfc', 'mobile_data', 'airplane', 'tether'], group: 'connectivity' },
  { patterns: ['battery', 'power', 'doze', 'charge'], group: 'battery' },
  { patterns: ['accessibility', 'talkback', 'magnif'], group: 'accessibility' },
  { patterns: ['lock', 'encrypt', 'credential', 'fingerprint', 'biometric', 'password'], group: 'security' },
  { patterns: ['navigation', 'nav_bar', 'gesture'], group: 'navigation' },
  { patterns: ['samsung', 'sem_', 'oneui', 'spen', 'edge_', 'bixby', 'smart_', 'air_', 'aod_'], group: 'samsung' },
];

/**
 * Get metadata for a setting key.
 * Checks curated registry first, then pattern matching, then fallback.
 */
export function getSettingMeta(fullKey: string): SettingMeta {
  // 1. Check curated registry
  if (SETTINGS_REGISTRY[fullKey]) {
    return SETTINGS_REGISTRY[fullKey];
  }

  // 2. Pattern-based categorization
  const keyLower = fullKey.toLowerCase();
  const rawKey = fullKey.includes('.') ? fullKey.split('.').slice(1).join('.') : fullKey;
  const rawLower = rawKey.toLowerCase();

  for (const { patterns, group } of GROUP_PATTERNS) {
    if (patterns.some((p) => rawLower.includes(p))) {
      const category = fullKey.split('.')[0] as 'system' | 'secure' | 'global' | 'samsung';
      return {
        label: humanizeKey(rawKey),
        group,
        restoreType: category === 'system' ? 'auto' : 'guided',
        valueFormatter: formatSmartValue,
        priority: 500,
      };
    }
  }

  // 3. Fallback
  const category = fullKey.split('.')[0] as 'system' | 'secure' | 'global' | 'samsung';
  return {
    label: humanizeKey(rawKey),
    group: 'other',
    restoreType: category === 'system' ? 'auto' : 'info',
    valueFormatter: formatSmartValue,
    priority: 999,
  };
}

/** Known acronyms/abbreviations that should be uppercased or expanded. */
const ACRONYMS: Record<string, string> = {
  aod: 'AOD (Always On Display)',
  nfc: 'NFC',
  led: 'LED',
  gps: 'GPS',
  usb: 'USB',
  vpn: 'VPN',
  dns: 'DNS',
  sms: 'SMS',
  mms: 'MMS',
  apn: 'APN',
  url: 'URL',
  wifi: 'Wi-Fi',
  ime: 'Input Method',
  sem: 'Samsung',
  spen: 'S Pen',
  hdr: 'HDR',
  dtmf: 'DTMF',
  tts: 'Text-to-Speech',
  ui: 'UI',
  lte: 'LTE',
  oem: 'OEM',
  dpi: 'DPI',
};

/**
 * Convert a raw key like "screen_off_timeout" to "Screen Off Timeout".
 * Recognizes common acronyms and expands abbreviations.
 */
function humanizeKey(key: string): string {
  return key
    .split('_')
    .map((word) => {
      const lower = word.toLowerCase();
      if (ACRONYMS[lower]) return ACRONYMS[lower];
      if (word.length === 0) return '';
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .filter(Boolean)
    .join(' ');
}

/**
 * Group labels for display.
 */
export const GROUP_LABELS: Record<SettingGroup, string> = {
  display: 'Display',
  sound: 'Sound & Vibration',
  keyboard: 'Keyboard & Input',
  connectivity: 'Connectivity',
  battery: 'Battery & Power',
  accessibility: 'Accessibility',
  security: 'Security & Developer',
  navigation: 'Navigation',
  defaults: 'Default Apps',
  apps: 'Installed Apps',
  samsung: 'Samsung',
  other: 'Other Settings',
};

/**
 * Group display order (lower = first).
 */
export const GROUP_ORDER: Record<SettingGroup, number> = {
  samsung: 0,
  keyboard: 1,
  display: 2,
  navigation: 3,
  sound: 4,
  defaults: 5,
  accessibility: 6,
  connectivity: 7,
  battery: 8,
  security: 9,
  apps: 10,
  other: 11,
};

// ==================== JUNK FILTER ====================

/**
 * Setting key patterns that are internal/system-level and NOT accessible
 * to users through any Settings UI. These should be filtered from the
 * Guided Restore wizard so users aren't told to find unfindable settings.
 */
const JUNK_KEY_PATTERNS: string[] = [
  'a2dp_uhqa',          // Samsung internal Bluetooth codec quality
  'a2dp_offload',       // Bluetooth hardware offload (internal)
  'bluetooth_addr',     // Bluetooth MAC address (read-only)
  'bluetooth_name',     // Resolves automatically from device name
  'bluetooth_class',    // Bluetooth device class (internal)
  'ble_scan_',          // BLE scanning params (internal)
  'wifi_watchdog',      // Wi-Fi watchdog (internal)
  'wifi_max_dhcp',      // DHCP retry (internal)
  'wifi_sleep_policy',  // Wi-Fi sleep behavior (deprecated on modern Android)
  'wifi_scan_',         // Wi-Fi scan intervals (internal)
  'netstats_',          // Network statistics (internal)
  'zen_mode',           // Do Not Disturb internal state
  'zen_duration',       // DND duration internals
  'sync_parent_sounds', // Samsung Knox internal
  'device_provisioned', // First-boot flag (read-only)
  'user_setup_complete', // Setup wizard flag (read-only)
  'install_non_market_apps', // Deprecated since Android 8
  'package_verifier',   // Play Protect internals
  'mount_play_not_snd', // Mount notification sound (buried)
  'lock_screen_custom', // Lock screen internal state
  'lock_to_app_enabled', // Screen pinning internal
  'multi_press_timeout', // Internal accessibility timing
  'pointer_speed',      // Mouse pointer (rarely relevant)
  'backup_',            // Backup service internals
  'bugreport_in_power', // Bug report toggle (dev)
  'data_roaming',       // Carrier setting (risky to auto-change)
  'mobile_data',        // Carrier setting (risky)
  'cdma_',              // CDMA radio settings
  'preferred_network',  // Network mode (carrier)
  'captive_portal',     // Captive portal detection (internal)
  'private_dns',        // DNS settings (technical)
  'connectivity_change', // Network change internals
  'sem_enhanced_cpu',   // Samsung Enterprise Management
  'knox_',              // Samsung Knox (enterprise)
  'ssrm_',              // Samsung SSRM (internal)
  'surface_composition', // Display compositor (internal)
  'peak_refresh_rate',  // Handled by display settings (auto-managed)
  'min_refresh_rate',   // Handled by display settings (auto-managed)
];

/**
 * Returns true if a setting key is "junk" — internal/system-level and
 * not accessible to users through any Settings UI.
 */
export function isJunkSetting(fullKey: string): boolean {
  const keyLower = fullKey.toLowerCase();
  return JUNK_KEY_PATTERNS.some(pattern => keyLower.includes(pattern));
}

// ==================== WIZARD HELPERS ====================

import type { SettingDiff } from '../types/profile';

/**
 * Generate smarter generic steps for settings without curated instructions.
 * Uses keyword detection to suggest WHERE in Settings to look.
 */
function getGenericSteps(diff: SettingDiff): string[] {
  const rawKey = diff.key.split('.').slice(1).join('.');
  const keyLower = rawKey.toLowerCase();
  const label = diff.label || humanizeKey(rawKey);

  if (diff.category === 'defaults') {
    return [
      'Open Settings > Apps > Default apps',
      `Find the category for "${label}"`,
      'Select the app that matches your old phone',
    ];
  }

  if (diff.category === 'samsung') {
    // Samsung-specific: try to detect the settings section
    if (keyLower.includes('aod')) {
      return [
        'Open Settings > Lock screen > Always On Display',
        `Look for "${label}"`,
        'Change it to match the value shown above',
      ];
    }
    if (keyLower.includes('lock') || keyLower.includes('fingerprint') || keyLower.includes('biometric')) {
      return [
        'Open Settings > Lock screen (or Biometrics and security)',
        `Look for "${label}"`,
        'Change it to match the value shown above',
      ];
    }
    if (keyLower.includes('sound') || keyLower.includes('vibrat') || keyLower.includes('volume') || keyLower.includes('ring')) {
      return [
        'Open Settings > Sounds and vibration',
        `Look for "${label}"`,
        'Change it to match the value shown above',
      ];
    }
    if (keyLower.includes('motion') || keyLower.includes('gesture') || keyLower.includes('palm') || keyLower.includes('wake')) {
      return [
        'Open Settings > Advanced features > Motions and gestures',
        `Look for "${label}"`,
        'Toggle to match your old phone',
      ];
    }
    if (keyLower.includes('keyboard') || keyLower.includes('input') || keyLower.includes('ime')) {
      return [
        'Open Settings > General management > Samsung Keyboard settings',
        `Look for "${label}"`,
        'Change it to match the value shown above',
      ];
    }
    if (keyLower.includes('edge') || keyLower.includes('panel')) {
      return [
        'Open Settings > Display > Edge panels',
        `Look for "${label}"`,
        'Toggle or configure to match your old phone',
      ];
    }
    // Generic Samsung fallback — still better than before
    return [
      `Open Settings and search for "${label}"`,
      'Samsung has a search bar at the top of Settings — type it in',
      'Change it to match the value shown above',
    ];
  }

  if (diff.category === 'secure') {
    if (keyLower.includes('accessibility') || keyLower.includes('talkback') || keyLower.includes('magnif')) {
      return [
        'Open Settings > Accessibility',
        `Look for "${label}"`,
        'Change it to match the value shown above',
      ];
    }
    if (keyLower.includes('keyboard') || keyLower.includes('input') || keyLower.includes('ime')) {
      return [
        'Open Settings > General management > Keyboard',
        `Look for "${label}"`,
        'Change it to match the value shown above',
      ];
    }
    return [
      `Open Settings and search for "${label}"`,
      'Use the search bar at the top of Settings to find it quickly',
      'Change it to match the value shown above',
      'If you can\'t find it, tap Skip — some settings are device-specific',
    ];
  }

  if (diff.category === 'global') {
    if (keyLower.includes('adb') || keyLower.includes('debug') || keyLower.includes('animator') || keyLower.includes('animation')) {
      return [
        'Open Settings > Developer options',
        'If not visible: About phone > tap Build number 7 times',
        `Find "${label}"`,
        'Change it to match the value shown above',
      ];
    }
    return [
      `Open Settings and search for "${label}"`,
      'Use the search bar at the top of Settings to find it',
      'Change it to match the value shown above',
    ];
  }

  // System settings — most are auto-restorable, but fallback for guided ones
  return [
    `Open Settings and search for "${label}"`,
    'Change it to match the value shown above',
  ];
}

/**
 * Get the step-by-step instructions for a setting diff.
 * Uses Samsung-specific steps when available on Samsung devices.
 */
export function getStepsForDiff(
  diff: SettingDiff,
  isSamsung: boolean
): { steps: string[]; isGeneric: boolean } {
  const meta = SETTINGS_REGISTRY[diff.key];

  if (meta) {
    if (isSamsung && meta.samsungSteps) {
      return { steps: meta.samsungSteps, isGeneric: false };
    }
    if (meta.steps) {
      return { steps: meta.steps, isGeneric: false };
    }
  }

  return { steps: getGenericSteps(diff), isGeneric: true };
}

/**
 * Get the correct settings intent for a diff, with Samsung override.
 */
export function getIntentForDiff(diff: SettingDiff, isSamsung: boolean): string {
  const meta = SETTINGS_REGISTRY[diff.key];

  if (meta && isSamsung && meta.samsungIntent) {
    return meta.samsungIntent;
  }

  return diff.settingsIntent || SETTINGS_INTENTS.GENERAL;
}
