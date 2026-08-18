/**
 * Untrusted-profile validation boundary.
 *
 * Everything reaching here arrived from outside the app: a JSON file the
 * user tapped in a file manager, an Android intent, a deep link, or a file
 * on disk another process could have written. It is hostile input until
 * proven otherwise.
 *
 * The previous boundary checked only that `device` and `settings` existed
 * and that `schemaVersion` was 1 or 2, then cast. Nothing validated the
 * TYPES of the thousands of key/value pairs underneath, and nothing bounded
 * the size -- yet those values flow onward to Settings.*.putString on the
 * device. A crafted profile was a list of arbitrary settings writes.
 *
 * Import-free and side-effect-free, so it is testable without Expo,
 * Firebase or a device.
 */
import type { DeviceProfile, InstalledApp, AppDefault } from '../types/profile';

/**
 * Bounds. A real Samsung scan is roughly 1500 settings across the four
 * namespaces plus a few hundred apps, so these sit well clear of legitimate
 * data while refusing anything designed to exhaust memory or the UI.
 */
export const LIMITS = {
  /** Raw JSON text length. Far past any real device profile. */
  maxJsonChars: 4 * 1024 * 1024,
  /** Per settings namespace (system / secure / global / samsung). */
  maxKeysPerNamespace: 5000,
  /** Settings keys and values are short by nature. */
  maxKeyLength: 256,
  maxValueLength: 8192,
  /** Installed-app entries. */
  maxApps: 5000,
  maxStringField: 512,
  /** `defaults` map entries. */
  maxDefaults: 200,
} as const;

export type ValidationFailure =
  | 'not_json_object'
  | 'too_large'
  | 'missing_device'
  | 'missing_settings'
  | 'unsupported_schema_version'
  | 'malformed_device'
  | 'malformed_settings'
  | 'malformed_apps'
  | 'malformed_defaults'
  | 'too_many_entries'
  | 'value_too_long';

export class ProfileValidationError extends Error {
  readonly code = 'PROFILE_INVALID';
  // Declared and assigned explicitly rather than as a TS parameter property:
  // parameter properties are not type-stripping-safe, and the focused tests
  // run this module directly through node's stripper.
  readonly reason: ValidationFailure;
  constructor(reason: ValidationFailure, message: string) {
    super(message);
    this.name = 'ProfileValidationError';
    this.reason = reason;
  }
}

/** Coarse, non-technical text. Never echoes attacker-supplied content. */
const MESSAGES: Record<ValidationFailure, string> = {
  not_json_object: 'This file is not an AfterSwitch profile.',
  too_large: 'This profile file is too large to be a real device profile.',
  missing_device: 'This file is missing its device information.',
  missing_settings: 'This file is missing its settings.',
  unsupported_schema_version:
    'This profile was made by a newer version of AfterSwitch. Update the app to open it.',
  malformed_device: 'The device information in this profile is not readable.',
  malformed_settings: 'The settings in this profile are not readable.',
  malformed_apps: 'The app list in this profile is not readable.',
  malformed_defaults: 'The default-app list in this profile is not readable.',
  too_many_entries: 'This profile contains far more entries than a real device.',
  value_too_long: 'This profile contains a value far longer than a real setting.',
};

function fail(reason: ValidationFailure): never {
  throw new ProfileValidationError(reason, MESSAGES[reason]);
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Bounded string, or undefined. Wrong types coerce out rather than throw. */
function optString(v: unknown, max = LIMITS.maxStringField): string | undefined {
  if (typeof v !== 'string') return undefined;
  if (v.length > max) fail('value_too_long');
  return v;
}

/**
 * Validate one settings namespace: a flat string -> string map.
 *
 * Non-string values are DROPPED rather than coerced. A value that is not a
 * string was never a real Android setting, and coercing it would manufacture
 * a plausible-looking write target out of malformed input.
 */
function cleanNamespace(v: unknown): Record<string, string> {
  if (v === undefined || v === null) return {};
  if (!isRecord(v)) fail('malformed_settings');
  const entries = Object.entries(v);
  if (entries.length > LIMITS.maxKeysPerNamespace) fail('too_many_entries');

  const out: Record<string, string> = {};
  for (const [k, val] of entries) {
    if (typeof k !== 'string' || k.length === 0 || k.length > LIMITS.maxKeyLength) continue;
    if (typeof val !== 'string') continue;
    if (val.length > LIMITS.maxValueLength) fail('value_too_long');
    out[k] = val;
  }
  return out;
}

function cleanApps(v: unknown): InstalledApp[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) fail('malformed_apps');
  if (v.length > LIMITS.maxApps) fail('too_many_entries');

  const out: InstalledApp[] = [];
  for (const raw of v) {
    if (!isRecord(raw)) continue;
    const packageName = optString(raw.packageName);
    if (!packageName) continue; // an entry without a package is not an app
    out.push({
      packageName,
      label: optString(raw.label) ?? packageName,
      versionName: optString(raw.versionName) ?? '',
      isSystemApp: raw.isSystemApp === true,
    });
  }
  return out;
}

/** v1 stored defaults as plain strings, v2 as {packageName,label}. Accept both. */
function cleanDefaults(v: unknown): Record<string, AppDefault | null> {
  if (v === undefined || v === null) return {};
  if (!isRecord(v)) fail('malformed_defaults');
  const entries = Object.entries(v);
  if (entries.length > LIMITS.maxDefaults) fail('too_many_entries');

  const out: Record<string, AppDefault | null> = {};
  for (const [k, val] of entries) {
    if (typeof k !== 'string' || k.length === 0 || k.length > LIMITS.maxKeyLength) continue;
    if (val === null || val === undefined) {
      out[k] = null;
      continue;
    }
    if (typeof val === 'string') {
      const label = optString(val);
      out[k] = label ? { packageName: '', label } : null;
      continue;
    }
    if (isRecord(val)) {
      out[k] = {
        packageName: optString(val.packageName) ?? '',
        label: optString(val.label) ?? '',
      };
      continue;
    }
    out[k] = null;
  }
  return out;
}

function cleanDevice(v: unknown): DeviceProfile['device'] {
  if (!isRecord(v)) fail('malformed_device');
  const model = optString(v.model);
  const manufacturer = optString(v.manufacturer);
  const sdkRaw = v.sdkInt;
  const sdkInt =
    typeof sdkRaw === 'number' && Number.isFinite(sdkRaw) && sdkRaw >= 0 && sdkRaw < 1000
      ? Math.floor(sdkRaw)
      : 0;
  return {
    nickname: optString(v.nickname) ?? model ?? 'Unknown',
    manufacturer: manufacturer ?? 'Unknown',
    brand: optString(v.brand) ?? manufacturer ?? 'Unknown',
    model: model ?? 'Unknown',
    os: 'Android',
    osVersion: optString(v.osVersion) ?? '0',
    sdkInt,
    securityPatch: optString(v.securityPatch) ?? '',
    oneUiVersion: optString(v.oneUiVersion) ?? null,
  };
}

/** Guard the raw text before it is even parsed. */
export function assertImportSizeOk(text: string): void {
  if (text.length > LIMITS.maxJsonChars) fail('too_large');
}

/**
 * The one entry point. Accepts schema v1 and v2 and returns a validated v2
 * profile whose settings maps are guaranteed string -> string.
 */
export function validateAndMigrateProfile(data: unknown): DeviceProfile {
  if (!isRecord(data)) fail('not_json_object');
  if (data.device === undefined || data.device === null) fail('missing_device');
  if (data.settings === undefined || data.settings === null) fail('missing_settings');

  const version = data.schemaVersion;
  const isV1 = version === 1 || version === undefined || version === null;
  const isV2 = version === 2;
  if (!isV1 && !isV2) fail('unsupported_schema_version');

  if (!isRecord(data.settings)) fail('malformed_settings');
  const s = data.settings;

  // v1 recorded installed apps as a string[] under apps.installedPackages.
  const appsRaw = isRecord(data.apps) ? data.apps : {};
  let installed: InstalledApp[];
  if (Array.isArray(appsRaw.installedPackages)) {
    if (appsRaw.installedPackages.length > LIMITS.maxApps) fail('too_many_entries');
    installed = appsRaw.installedPackages
      .filter((p): p is string => typeof p === 'string' && p.length > 0)
      .map((pkg) => ({
        packageName: pkg,
        label: pkg.split('.').pop() || pkg,
        versionName: '',
        isSystemApp: false,
      }));
  } else {
    installed = cleanApps(appsRaw.installed);
  }

  return {
    schemaVersion: 2,
    exportedAt: optString(data.exportedAt) ?? new Date().toISOString(),
    exportedBy:
      optString(data.exportedBy) ??
      (isV1 ? 'AfterSwitch (migrated from v1)' : 'AfterSwitch'),
    device: cleanDevice(data.device),
    defaults: cleanDefaults(data.defaults),
    settings: {
      system: cleanNamespace(s.system),
      secure: cleanNamespace(s.secure),
      global: cleanNamespace(s.global),
      samsung: cleanNamespace(s.samsung),
    },
    apps: { installed },
  };
}
