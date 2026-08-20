/**
 * Same-device restore regressions.
 *
 * Pins the vc2 defect: model + nickname identity must not fabricate zero
 * diffs and must not replace an imported restore baseline on scan.
 *
 * EXECUTABLE  real compareSelectedProfiles / applyFreshScan / compareProfiles
 * STRUCTURAL  App.tsx call sites and the removed identity shortcuts
 *
 * Run: node scripts/test-same-device-restore.mjs
 */
import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const strip = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('.') && !/\.[a-z]+$/i.test(spec)) {
      const base = new URL(spec, ctx.parentURL);
      for (const ext of ['.ts', '.tsx', '.js']) {
        const cand = new URL(base.href + ext);
        if (existsSync(fileURLToPath(cand))) return next(cand.href, ctx);
      }
    }
    return next(spec, ctx);
  },
});

let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name}${detail !== undefined ? ` -- ${detail}` : ''}`); }
};

async function load(rel) {
  try {
    return await import(pathToFileURL(join(root, rel)).href);
  } catch (e) {
    console.log(`     (could not load ${rel}: ${String(e).split('\n')[0]})`);
    return null;
  }
}

const helperMod = await load('src/services/sameDeviceRestore.ts');
const compareMod = await load('src/services/profileCompare.ts');
const planMod = await load('src/services/restorePlan.ts');

const S24 = {
  nickname: "MICHAEL's S24 Ultra",
  manufacturer: 'samsung',
  brand: 'samsung',
  model: 'SM-S928U',
  os: 'Android',
  osVersion: '16',
  sdkInt: 36,
  securityPatch: '2026-08-01',
  oneUiVersion: '17.5',
};

const FOLD = { ...S24, nickname: "MICHAEL's Z Fold7", model: 'SM-F966U' };

const AUTO = {
  system: {
    sound_effects_enabled: '1',
    haptic_feedback_enabled: '1',
    accelerometer_rotation: '1',
    screen_brightness_mode: '0',
    screen_off_timeout: '600000',
    volume_music: '7',
    volume_notification: '11',
    volume_ring: '11',
    volume_alarm: '11',
    font_scale: '1.0',
  },
  secure: {
    long_press_timeout: '500',
    show_ime_with_hard_keyboard: '1',
  },
  global: {
    window_animation_scale: '1.0',
    transition_animation_scale: '1.0',
  },
  samsung: {},
};

const profile = (device, settings, extra = {}) => ({
  schemaVersion: 2,
  exportedAt: extra.exportedAt || '2026-08-19T21:13:27.000Z',
  exportedBy: 'test',
  device,
  defaults: extra.defaults || {},
  settings: {
    system: { ...AUTO.system, ...(settings?.system || {}) },
    secure: { ...AUTO.secure, ...(settings?.secure || {}) },
    global: { ...AUTO.global, ...(settings?.global || {}) },
    samsung: { ...(settings?.samsung || {}) },
  },
  apps: { installed: extra.apps || [] },
});

const app = read('App.tsx');
const appClean = strip(app);
const helperSrc = read('src/services/sameDeviceRestore.ts');
const helperClean = strip(helperSrc);
const handleScan = appClean.slice(
  appClean.indexOf('const handleScan'),
  appClean.indexOf('const handleExport'),
);
const onRescan = appClean.slice(
  appClean.indexOf('onRescan='),
  appClean.indexOf('browse') > appClean.indexOf('onRescan=')
    ? appClean.indexOf("{activeTab === 'browse'")
    : appClean.length,
);

// ── helper exists and has no identity shortcut ───────────────────────────
check('sameDeviceRestore module loads', !!helperMod);
check('compareSelectedProfiles is exported', typeof helperMod?.compareSelectedProfiles === 'function');
check('applyFreshScan is exported', typeof helperMod?.applyFreshScan === 'function');
check('shouldPersistImportedAfterScan is exported', typeof helperMod?.shouldPersistImportedAfterScan === 'function');
check('helper never inspects model or nickname',
  !/\.model|\.nickname/.test(helperClean));
check('scan persistence of imported is hard-closed',
  helperMod?.shouldPersistImportedAfterScan() === false);

// ── same model + nickname + identical content → natural zero diffs ───────
{
  const current = profile(S24, {});
  const imported = profile(S24, {}, { exportedAt: '2026-03-14T23:00:00.000Z' });
  const viaHelper = helperMod?.compareSelectedProfiles(current, imported);
  const viaCompare = compareMod?.compareProfiles(current, imported);
  check('identical same-device content: helper totalDiffs is 0',
    viaHelper?.summary.totalDiffs === 0, JSON.stringify(viaHelper?.summary));
  check('identical same-device content: compareProfiles totalDiffs is 0',
    viaCompare?.summary.totalDiffs === 0, JSON.stringify(viaCompare?.summary));
  check('identical same-device content: auto/guided/info/apps are 0',
    viaHelper?.summary.autoRestoreCount === 0 &&
    viaHelper?.summary.guidedCount === 0 &&
    viaHelper?.summary.infoCount === 0 &&
    viaHelper?.summary.missingApps === 0);
  check('identical same-device zero-diff is not a fabricated empty object',
    Array.isArray(viaHelper?.settings) && Array.isArray(viaHelper?.apps));
}

// ── same model + nickname + one changed automatic setting → one real diff
{
  const imported = profile(S24, {});
  const current = profile(S24, { system: { font_scale: '1.1' } });
  const result = helperMod?.compareSelectedProfiles(current, imported);
  const autos = result?.settings.filter((d) => d.restoreType === 'auto') || [];
  check('one changed automatic setting produces one auto diff',
    autos.length === 1, `auto=${autos.length} keys=${autos.map((d) => d.key).join(',')}`);
  check('that auto diff is system.font_scale',
    autos[0]?.key === 'system.font_scale');
  check('that auto diff has the imported raw value 1.0',
    autos[0]?.rawOldValue === '1.0');
  check('that auto diff has the live raw value 1.1',
    autos[0]?.rawNewValue === '1.1');
  check('no extra guided or info diffs from a single auto change',
    result?.summary.guidedCount === 0 && result?.summary.infoCount === 0,
    JSON.stringify(result?.summary));
}

// ── same model + nickname + multiple changed automatic settings ──────────
{
  const imported = profile(S24, {});
  const current = profile(S24, {
    system: {
      sound_effects_enabled: '0',
      haptic_feedback_enabled: '0',
      font_scale: '1.1',
      screen_off_timeout: '300000',
    },
    secure: { long_press_timeout: '400' },
    global: { window_animation_scale: '0.5' },
  });
  const result = helperMod?.compareSelectedProfiles(current, imported);
  const autos = (result?.settings.filter((d) => d.restoreType === 'auto') || [])
    .map((d) => d.key)
    .sort();
  const expected = [
    'global.window_animation_scale',
    'secure.long_press_timeout',
    'system.font_scale',
    'system.haptic_feedback_enabled',
    'system.screen_off_timeout',
    'system.sound_effects_enabled',
  ];
  check('six changed automatic settings produce six auto diffs',
    autos.length === 6, `got ${autos.join(',')}`);
  check('those six diffs are the six changed keys',
    JSON.stringify(autos) === JSON.stringify(expected), autos.join(','));
}

// ── classification is retained on same-device diffs ──────────────────────
{
  const imported = profile(S24, {
    secure: {
      spell_checker_enabled: '1',
      default_input_method: 'com.samsung.android.honeyboard/.service.HoneyBoardService',
    },
  });
  const current = profile(S24, {
    system: { font_scale: '1.1' },
    secure: {
      spell_checker_enabled: '0',
      default_input_method: 'com.google.android.inputmethod.latin/com.android.inputmethod.latin.LatinIME',
    },
  });
  const result = helperMod?.compareSelectedProfiles(current, imported);
  const byKey = Object.fromEntries((result?.settings || []).map((d) => [d.key, d]));
  check('same-device font_scale stays automatic',
    byKey['system.font_scale']?.restoreType === 'auto');
  check('same-device spell_checker_enabled stays guided',
    byKey['secure.spell_checker_enabled']?.restoreType === 'guided');
  check('same-device default_input_method stays read-only/info',
    byKey['secure.default_input_method']?.restoreType === 'info');
  check('unsupported same-device key is not planned as a write',
    planMod
      ? planMod.planRestore(result.settings, { system: true, secure: true, global: true })
        .writes.every((w) => w.diffKey === 'system.font_scale')
      : false);
}

// ── scan does not overwrite importedProfile or its storage bytes ─────────
{
  const imported = profile(S24, {});
  const fresh = profile(S24, { system: { font_scale: '1.1' } }, { exportedAt: '2026-08-20T03:00:00.000Z' });
  const beforeBytes = JSON.stringify(imported);
  const after = helperMod?.applyFreshScan(imported, fresh);
  check('applyFreshScan current is the fresh scan', after?.current === fresh);
  check('applyFreshScan imported is the same object as before', after?.imported === imported);
  check('imported snapshot is byte-identical after rescan',
    JSON.stringify(after?.imported) === beforeBytes);
  check('fresh scan settings are not copied onto imported',
    after?.imported?.settings.system.font_scale === '1.0' &&
    after?.current?.settings.system.font_scale === '1.1');
  check('null imported stays null after scan',
    helperMod?.applyFreshScan(null, fresh).imported === null);
}

// ── different-device comparison still works ──────────────────────────────
{
  const s24 = profile(S24, { system: { font_scale: '1.1' } });
  const fold = profile(FOLD, {});
  const result = helperMod?.compareSelectedProfiles(s24, fold);
  const font = result?.settings.find((d) => d.key === 'system.font_scale');
  check('different-device comparison still returns real diffs',
    result?.summary.autoRestoreCount >= 1 && font?.restoreType === 'auto');
  check('different-device identity is not required for a diff',
    s24.device.model !== fold.device.model && s24.device.nickname !== fold.device.nickname);
}

// ── App.tsx wiring: shortcut removed, baseline retained ──────────────────
check('App.tsx compares through compareSelectedProfiles',
  /compareSelectedProfiles\(\s*currentProfile,\s*importedProfile\s*\)/.test(appClean));
check('App.tsx no longer imports compareProfiles directly',
  !/import \{[^}]*compareProfiles[^}]*\} from/.test(app));
check('App.tsx has no model+nickname equality short-circuit',
  !/device\.model\s*===\s*importedProfile\.device\.model/.test(appClean) &&
  !/device\.nickname\s*===\s*importedProfile\.device\.nickname/.test(appClean));
check('App.tsx no longer fabricates an empty ComparisonResult',
  !/autoRestoreCount:\s*0,\s*guidedCount:\s*0,\s*infoCount:\s*0/.test(appClean));
check('handleScan calls applyFreshScan',
  /applyFreshScan\(\s*importedProfile,\s*profile\s*\)/.test(handleScan));
check('handleScan does not write STORAGE_KEY_IMPORTED',
  !/STORAGE_KEY_IMPORTED/.test(handleScan));
check('handleScan does not call setImportedProfile',
  !/setImportedProfile/.test(handleScan));
check('onRescan still updates only the current profile',
  /setCurrentProfile\(profile\)/.test(onRescan) &&
  !/setImportedProfile/.test(onRescan) &&
  !/STORAGE_KEY_IMPORTED/.test(onRescan));

// ── existing quick-check and privacy-hold contracts still hold ───────────
check('quickSettingsCheck is still used',
  /quickSettingsCheck\(loadedProfile\)/.test(appClean));
check('handleScan still records a local-only quickCheck match',
  /setQuickCheck\(\{ settingsMatch: true/.test(handleScan));
check('no saveProfileToCloud call site in App.tsx',
  !/saveProfileToCloud\s*\(/.test(appClean));
check('scan path still forces cloudSaved false without uploading',
  /setCloudSaved\(false\)/.test(handleScan) && !/setCloudSaved\(true\)/.test(handleScan));
check('privacy-hold flags remain compile-time false',
  read('src/services/privacyHold.ts').includes('export const COMMUNITY_SHARING_ENABLED = false;') &&
  read('src/services/privacyHold.ts').includes('export const COMMUNITY_RETRIEVAL_ENABLED = false;') &&
  read('src/services/privacyHold.ts').includes('export const RAW_CLOUD_UPLOAD_ENABLED = false;'));
check('bounded restore allowlist still has 14 auto specs',
  (read('src/data/restoreAllowlist.ts').match(/tier: 'auto'/g) || []).length === 14);

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
