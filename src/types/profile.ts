// AfterSwitch Profile Schema v2
// Captures full device settings snapshot for migration

export type AppTab = 'home' | 'scan' | 'compare' | 'restore' | 'browse';

export type AppDefault = {
  packageName: string;
  label: string;
};

export type InstalledApp = {
  packageName: string;
  label: string;
  versionName: string;
  isSystemApp: boolean;
};

export type DeviceProfile = {
  schemaVersion: 2;
  exportedAt: string;
  exportedBy: string;
  device: {
    nickname: string;
    manufacturer: string;
    brand: string;
    model: string;
    os: 'Android';
    osVersion: string;
    sdkInt: number;
    securityPatch: string;
    oneUiVersion: string | null;
  };
  defaults: Record<string, AppDefault | null>;
  settings: {
    system: Record<string, string>;
    secure: Record<string, string>;
    global: Record<string, string>;
    samsung: Record<string, string>;
  };
  apps: {
    installed: InstalledApp[];
  };
};

// Comparison types — computed at compare time, never stored in profile

export type SettingGroup =
  | 'display'
  | 'sound'
  | 'keyboard'
  | 'connectivity'
  | 'battery'
  | 'accessibility'
  | 'security'
  | 'navigation'
  | 'defaults'
  | 'apps'
  | 'samsung'
  | 'other';

export type RestoreType = 'auto' | 'guided' | 'info';

export type SettingDiff = {
  key: string;
  category: 'system' | 'secure' | 'global' | 'samsung' | 'defaults';
  label: string;
  group: SettingGroup;
  oldValue: string;
  newValue: string;
  /**
   * The raw provider values. `null` means the profile had NO ROW for this
   * key — which is different from a row holding an empty string, and the
   * difference matters: the old write path used `rawOldValue || oldValue`,
   * so an empty string fell through to the formatted display value and a
   * literal '(not set)' could be written into the settings provider.
   */
  rawOldValue: string | null;
  rawNewValue: string | null;
  restoreType: RestoreType;
  settingsIntent?: string;
  description?: string;
  priority: number;
};

export type AppDiff = {
  packageName: string;
  label: string;
  status: 'missing' | 'version_mismatch';
  oldVersion?: string;
  newVersion?: string;
  playStoreUrl: string;
};

export type ComparisonResult = {
  settings: SettingDiff[];
  apps: AppDiff[];
  summary: {
    totalDiffs: number;
    autoRestoreCount: number;
    guidedCount: number;
    infoCount: number;
    missingApps: number;
  };
};

export type ScanProgress = {
  system: boolean;
  secure: boolean;
  global: boolean;
  samsung: boolean;
  device: boolean;
  apps: boolean;
  defaults: boolean;
};
