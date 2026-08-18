/**
 * Untrusted-import boundary tests.
 *
 * Runs the real module — no mocks, no framework. profileValidation.ts is
 * import-free by design precisely so it can be tested without Expo, Firebase
 * or a device.
 *
 * Run: node --experimental-strip-types scripts/test-import-validation.mjs
 */
import {
  validateAndMigrateProfile,
  assertImportSizeOk,
  ProfileValidationError,
  LIMITS,
} from '../src/services/profileValidation.ts';

let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name}${detail !== undefined ? ` — ${detail}` : ''}`); }
};

/** Returns the ValidationFailure reason, or null if it did not throw. */
function reasonOf(fn) {
  try { fn(); return null; }
  catch (e) { return e instanceof ProfileValidationError ? e.reason : `WRONG_ERROR:${e?.name}`; }
}

const V2 = {
  schemaVersion: 2,
  exportedAt: '2026-03-14T00:00:00.000Z',
  exportedBy: 'AfterSwitch v0.2.0',
  device: { nickname: 'Phone', manufacturer: 'samsung', brand: 'samsung',
            model: 'SM-S928U', os: 'Android', osVersion: '16', sdkInt: 36,
            securityPatch: '2026-03-01', oneUiVersion: '8.0' },
  defaults: { browser: { packageName: 'com.x', label: 'X' } },
  settings: { system: { screen_brightness: '128' }, secure: { a: '1' },
              global: { b: '2' }, samsung: { sem_x: '3' } },
  apps: { installed: [{ packageName: 'com.x', label: 'X', versionName: '1', isSystemApp: false }] },
};

const V1 = {
  schemaVersion: 1,
  device: { model: 'SM-G991U', manufacturer: 'samsung' },
  settings: { system: { screen_brightness: '100' } },
  defaults: { browser: 'Chrome' },
  apps: { installedPackages: ['com.a', 'com.b'] },
};

// ── 1. Valid v1/v2 imports still succeed ────────────────────────────────
{
  const v2 = validateAndMigrateProfile(V2);
  check('v2 profile imports', v2.schemaVersion === 2 && v2.device.model === 'SM-S928U');
  check('v2 settings survive intact',
    v2.settings.system.screen_brightness === '128' && v2.settings.samsung.sem_x === '3');
  check('v2 apps survive intact', v2.apps.installed.length === 1);

  const v1 = validateAndMigrateProfile(V1);
  check('v1 profile migrates to v2', v1.schemaVersion === 2);
  check('v1 installedPackages migrate to app objects',
    v1.apps.installed.length === 2 && v1.apps.installed[0].packageName === 'com.a');
  check('v1 string defaults migrate to AppDefault',
    v1.defaults.browser?.label === 'Chrome');
  check('v1 missing device fields get safe placeholders',
    v1.device.os === 'Android' && v1.device.osVersion === '0' && v1.device.sdkInt === 0);
  check('a missing schemaVersion is treated as v1',
    validateAndMigrateProfile({ ...V1, schemaVersion: undefined }).schemaVersion === 2);
}

// ── 2. Malformed shapes are rejected ────────────────────────────────────
{
  check('null is rejected', reasonOf(() => validateAndMigrateProfile(null)) === 'not_json_object');
  check('an array is rejected', reasonOf(() => validateAndMigrateProfile([])) === 'not_json_object');
  check('a string is rejected', reasonOf(() => validateAndMigrateProfile('x')) === 'not_json_object');
  check('missing device is rejected',
    reasonOf(() => validateAndMigrateProfile({ settings: {} })) === 'missing_device');
  check('missing settings is rejected',
    reasonOf(() => validateAndMigrateProfile({ device: {} })) === 'missing_settings');
  check('a future schema version is rejected',
    reasonOf(() => validateAndMigrateProfile({ ...V2, schemaVersion: 99 })) === 'unsupported_schema_version');
  check('a non-object device is rejected',
    reasonOf(() => validateAndMigrateProfile({ ...V2, device: 'x' })) === 'malformed_device');
  check('non-object settings are rejected',
    reasonOf(() => validateAndMigrateProfile({ ...V2, settings: 'x' })) === 'malformed_settings');
  check('a non-object namespace is rejected',
    reasonOf(() => validateAndMigrateProfile({ ...V2, settings: { system: 'x' } })) === 'malformed_settings');
  check('a non-array apps.installed is rejected',
    reasonOf(() => validateAndMigrateProfile({ ...V2, apps: { installed: 'x' } })) === 'malformed_apps');
  check('non-object defaults are rejected',
    reasonOf(() => validateAndMigrateProfile({ ...V2, defaults: 'x' })) === 'malformed_defaults');

  // Type confusion inside the maps: dropped, never coerced into a write.
  const mixed = validateAndMigrateProfile({
    ...V2,
    settings: { ...V2.settings, system: { good: 'ok', bad: 42, worse: { nested: true }, nul: null } },
  });
  check('non-string setting values are DROPPED, not coerced',
    mixed.settings.system.good === 'ok' && Object.keys(mixed.settings.system).length === 1,
    JSON.stringify(mixed.settings.system));

  const badApps = validateAndMigrateProfile({
    ...V2, apps: { installed: [{ label: 'no package' }, 'string', null, { packageName: 'com.ok' }] },
  });
  check('app entries without a package name are dropped',
    badApps.apps.installed.length === 1 && badApps.apps.installed[0].packageName === 'com.ok');

  const badSdk = validateAndMigrateProfile({ ...V2, device: { ...V2.device, sdkInt: 'thirty-six' } });
  check('a non-numeric sdkInt falls back to 0', badSdk.device.sdkInt === 0);
}

// ── 3. Oversized / unbounded input is rejected ──────────────────────────
{
  check('oversized raw JSON text is refused before parsing',
    reasonOf(() => assertImportSizeOk('x'.repeat(LIMITS.maxJsonChars + 1))) === 'too_large');
  check('normal-sized text passes the size guard',
    reasonOf(() => assertImportSizeOk('x'.repeat(1000))) === null);

  const tooManyKeys = {};
  for (let i = 0; i <= LIMITS.maxKeysPerNamespace; i++) tooManyKeys[`k${i}`] = '1';
  check('too many keys in one namespace is refused',
    reasonOf(() => validateAndMigrateProfile({ ...V2, settings: { ...V2.settings, secure: tooManyKeys } }))
      === 'too_many_entries');

  check('an over-long setting value is refused',
    reasonOf(() => validateAndMigrateProfile({
      ...V2, settings: { ...V2.settings, system: { k: 'v'.repeat(LIMITS.maxValueLength + 1) } },
    })) === 'value_too_long');

  check('an over-long device string is refused',
    reasonOf(() => validateAndMigrateProfile({
      ...V2, device: { ...V2.device, nickname: 'n'.repeat(LIMITS.maxStringField + 1) },
    })) === 'value_too_long');

  check('too many apps is refused',
    reasonOf(() => validateAndMigrateProfile({
      ...V2, apps: { installed: new Array(LIMITS.maxApps + 1).fill({ packageName: 'com.x' }) },
    })) === 'too_many_entries');

  check('too many v1 installedPackages is refused',
    reasonOf(() => validateAndMigrateProfile({
      ...V1, apps: { installedPackages: new Array(LIMITS.maxApps + 1).fill('com.x') },
    })) === 'too_many_entries');

  check('too many defaults is refused',
    reasonOf(() => {
      const d = {};
      for (let i = 0; i <= LIMITS.maxDefaults; i++) d[`d${i}`] = 'x';
      return validateAndMigrateProfile({ ...V2, defaults: d });
    }) === 'too_many_entries');

  // An over-long KEY is dropped rather than fatal — a single bad key should
  // not make an otherwise good profile unopenable.
  const longKey = validateAndMigrateProfile({
    ...V2, settings: { ...V2.settings, system: { ['k'.repeat(LIMITS.maxKeyLength + 1)]: '1', ok: '2' } },
  });
  check('an over-long setting key is dropped, not fatal',
    Object.keys(longKey.settings.system).length === 1 && longKey.settings.system.ok === '2');
}

// ── 4. Failure messages stay coarse ─────────────────────────────────────
{
  let msg = '';
  try { validateAndMigrateProfile({ device: {}, settings: {}, schemaVersion: 99 }); }
  catch (e) { msg = e.message; }
  check('the error message does not echo attacker-supplied content',
    msg.length > 0 && !msg.includes('99'), msg);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
