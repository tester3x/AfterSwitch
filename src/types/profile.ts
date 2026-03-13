export type AppTab = "home" | "snapshot" | "import" | "restore";

export type ChecklistItem = {
  id: string;
  title: string;
  expectedValue: string;
  status: "pending" | "manual" | "complete";
  routeHint?: string;
};

export type ProfileSettingGroup = {
  [key: string]: string;
};

export type DeviceProfile = {
  schemaVersion: number;
  exportedAt: string;
  device: {
    nickname: string;
    manufacturer: string;
    model: string;
    os: string;
    osVersion: string;
  };
  defaults: {
    keyboard: string;
    browser: string;
    sms: string;
    launcher: string;
  };
  settings: {
    system: ProfileSettingGroup;
    secure: ProfileSettingGroup;
    global: ProfileSettingGroup;
  };
  apps: {
    installedPackages: string[];
  };
  checklist: ChecklistItem[];
};

export type DifferenceItem = {
  id: string;
  label: string;
  currentValue: string;
  importedValue: string;
  severity: "info" | "warning";
};
