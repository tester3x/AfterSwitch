/**
 * Bounded-restore regression suite.
 *
 * These assertions were written BEFORE the fix and are expected to fail on
 * baseline 365bc113. Each one names the defect it pins:
 *
 *   D1  unknown namespace/key pairs reach the automatic write path
 *   D2  a formatted display string can become the written value
 *   D3  a failed System write retries the same key in Secure and Global
 *   D4  no value is validated for type, domain or length before mutation
 *
 * Two kinds of assertion, and they are not equally strong:
 *
 *   EXECUTABLE  real modules loaded through a TypeScript resolution seam and
 *     called for real. compareProfiles and the restore planner run here.
 *   STRUCTURAL  source-text checks over RestoreScreen.tsx (JSX, not loadable
 *     in node) and the Kotlin module (not runnable here at all).
 *
 * Run: node scripts/test-bounded-restore.mjs
 */
import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const stripKt = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const stripTs = stripKt;

/**
 * Module-resolution seam: the product sources are TypeScript with
 * extensionless relative specifiers, which node resolves only with help.
 * Type-stripping does the rest. This runs the REAL modules — not a copy.
 */
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

/** Import a product module, or return null so a missing file is a FAIL not a crash. */
async function load(rel) {
  try {
    return await import(pathToFileURL(join(root, rel)).href);
  } catch (e) {
    console.log(`     (could not load ${rel}: ${String(e).split('\n')[0]})`);
    return null;
  }
}

const compareMod = await load('src/services/profileCompare.ts');
const allowMod = await load('src/data/restoreAllowlist.ts');
const planMod = await load('src/services/restorePlan.ts');
const validationMod = await load('src/services/profileValidation.ts');

const RESTORE = 'src/screens/RestoreScreen.tsx';
const KT = 'plugins/android/DeviceSettingsModule.kt';
const restoreSrc = stripTs(read(RESTORE));
const ktSrc = stripKt(read(KT));

// ── profile fixtures ──────────────────────────────────────────────────────
const blank = (settings, extra = {}) => ({
  schemaVersion: 2,
  exportedAt: '2026-01-01T00:00:00.000Z',
  exportedBy: 'test',
  device: {
    nickname: 'T', manufacturer: 'Samsung', brand: 'samsung', model: 'SM-S928U',
    os: 'Android', osVersion: '16', sdkInt: 36, securityPatch: '', oneUiVersion: '7',
  },
  defaults: {},
  settings: { system: {}, secure: {}, global: {}, samsung: {}, ...settings },
  apps: { installed: [] },
  ...extra,
});

/** old = imported profile, new = current device. */
const diff = (oldS, newS) =>
  compareMod ? compareMod.compareProfiles(blank(newS), blank(oldS)).settings : [];

const find = (diffs, key) => diffs.find((d) => d.key === key);
/** A diff that can reach a write is anything not read-only. */
const writable = (d) => d && d.restoreType !== 'info';

// ══ D1 — unknown namespace/key pairs must never be automatically restorable ══
{
  const unknown = {
    system: { zz_unknown_vendor_key: '1' },
    secure: { zz_unknown_vendor_key: '1' },
    global: { zz_unknown_vendor_key: '1' },
  };
  const d = diff(
    { system: { zz_unknown_vendor_key: '0' }, secure: { zz_unknown_vendor_key: '0' }, global: { zz_unknown_vendor_key: '0' } },
    unknown,
  );
  for (const ns of ['system', 'secure', 'global']) {
    const row = find(d, `${ns}.zz_unknown_vendor_key`);
    check(`D1: an unknown ${ns} key is not writable`,
      row !== undefined && !writable(row),
      row ? `restoreType=${row.restoreType}` : 'no diff produced');
  }

  // The pattern table promotes on SUBSTRINGS. None of these may promote.
  const SUBSTRING_TRAPS = [
    'zz_lock_vendor', 'zz_password_vendor', 'zz_biometric_vendor',
    'zz_accessibility_vendor', 'zz_wifi_vendor', 'zz_ime_vendor',
    'zz_credential_vendor', 'zz_fingerprint_vendor', 'zz_encrypt_vendor',
    'zz_bluetooth_vendor', 'zz_nav_bar_vendor', 'zz_input_vendor',
    'zz_display_vendor', 'zz_volume_vendor', 'zz_screen_vendor',
  ];
  const oldS = {}, newS = {};
  for (const k of SUBSTRING_TRAPS) { oldS[k] = '0'; newS[k] = '1'; }
  for (const ns of ['system', 'secure', 'global']) {
    const rows = diff({ [ns]: oldS }, { [ns]: newS });
    const promoted = SUBSTRING_TRAPS
      .map((k) => find(rows, `${ns}.${k}`))
      .filter((r) => writable(r));
    check(`D1: no substring promotes an unknown ${ns} key`,
      promoted.length === 0,
      promoted.map((r) => `${r.key}=${r.restoreType}`).join(', '));
  }
}

// ══ D2 — a missing source value must be absent, and never written ══════════
{
  // Target-only key: present on the device, absent from the imported profile.
  // Baseline keeps this as a diff with rawOldValue '' and writes oldValue.
  const rows = diff({}, { system: { screen_off_timeout: '30000' } });
  const row = find(rows, 'system.screen_off_timeout');
  if (row) {
    check('D2: a target-only difference carries no source value',
      row.rawOldValue === null || row.rawOldValue === undefined,
      `rawOldValue=${JSON.stringify(row.rawOldValue)}`);
    check('D2: a target-only difference is not writable',
      !writable(row), `restoreType=${row.restoreType}`);
  } else {
    check('D2: a target-only difference carries no source value', true);
    check('D2: a target-only difference is not writable', true);
  }

  check('D2: no write value is ever taken from the formatted display value',
    !/rawOldValue\s*\|\|\s*(diff\.)?oldValue/.test(restoreSrc) &&
    !/value:\s*d\.rawOldValue\s*\|\|/.test(restoreSrc),
    'RestoreScreen still falls back to the formatted oldValue');
  check('D2: RestoreScreen never passes oldValue to a write',
    !/write\w*Setting\([^)]*\.oldValue/.test(restoreSrc));
}

// ══ D3 — no cross-namespace retry ═══════════════════════════════════════════
{
  // The defect had a specific shape: a failure guard followed by a write to a
  // DIFFERENT namespace with the same key. An if/else-if chain on the
  // namespace looks similar to a naive proximity match but is not a retry, so
  // the assertion pins the failure guard, not the proximity.
  check('D3: no failure guard is followed by a write in another namespace',
    !/\(\s*!\s*(success|ok)\b[\s\S]{0,240}write(Secure|Global|System)Setting\(/.test(restoreSrc));
  check('D3: the specific baseline retry chain is gone',
    !/if \(!success && hasSecureSettings\)/.test(restoreSrc) &&
    !/success = await writeSystemSetting[\s\S]{0,300}success = await writeSecureSetting/.test(restoreSrc));
  check('D3: each namespace selects exactly one writer, by equality',
    /write\.namespace === 'system'[\s\S]{0,200}writeSystemSetting\(/.test(restoreSrc) &&
    /write\.namespace === 'secure'[\s\S]{0,200}writeSecureSetting\(/.test(restoreSrc) &&
    (restoreSrc.match(/await writeSystemSetting\(/g) || []).length === 1 &&
    (restoreSrc.match(/await writeSecureSetting\(/g) || []).length === 1 &&
    (restoreSrc.match(/await writeGlobalSetting\(/g) || []).length === 1);
}

// ══ D4 — validation before mutation ════════════════════════════════════════
{
  check('D4: an allowlist module exists', allowMod !== null);
  check('D4: it exposes an exact lookup', !!allowMod?.lookupSpec);
  check('D4: it exposes a validator', !!allowMod?.validateForWrite);

  if (allowMod?.validateForWrite) {
    const V = allowMod.validateForWrite;
    const BAD = [
      ['secure', 'long_press_timeout', '', 'empty'],
      ['secure', 'long_press_timeout', '   ', 'blank'],
      ['secure', 'long_press_timeout', '(not set)', 'formatter output'],
      ['secure', 'long_press_timeout', 'ON', 'formatter output'],
      ['secure', 'long_press_timeout', 'OFF', 'formatter output'],
      ['secure', 'long_press_timeout', 'Samsung Keyboard', 'app label'],
      ['secure', 'long_press_timeout', '99999999', 'out of range'],
      ['secure', 'long_press_timeout', '-1', 'negative'],
      ['secure', 'long_press_timeout', '1.5', 'wrong type'],
      ['secure', 'long_press_timeout', 'x'.repeat(5000), 'over-long'],
      ['global', 'window_animation_scale', 'ON', 'formatter output'],
      ['global', 'window_animation_scale', '1e309', 'non-finite'],
      ['global', 'window_animation_scale', '-2', 'out of range'],
      ['global', 'window_animation_scale', '', 'empty'],
      ['system', 'zz_unknown_vendor_key', '1', 'not allowlisted'],
      ['secure', 'zz_unknown_vendor_key', '1', 'not allowlisted'],
      ['global', 'zz_unknown_vendor_key', '1', 'not allowlisted'],
      ['samsung', 'aod_mode', '1', 'namespace not writable'],
      ['defaults', 'browser', 'com.x', 'namespace not writable'],
      ['secure', 'window_animation_scale', '1.0', 'right key, wrong namespace'],
      ['global', 'long_press_timeout', '400', 'right key, wrong namespace'],
    ];
    const leaked = BAD.filter(([ns, k, v]) => V(ns, k, v)?.ok === true)
      .map(([ns, k, , why]) => `${ns}.${k} (${why})`);
    check('D4: every invalid value is refused', leaked.length === 0, leaked.join(', '));

    const GOOD = [
      ['secure', 'long_press_timeout', '400'],
      ['secure', 'long_press_timeout', '1500'],
      ['global', 'window_animation_scale', '1.0'],
      ['global', 'window_animation_scale', '0.5'],
    ];
    const rejected = GOOD.filter(([ns, k, v]) => V(ns, k, v)?.ok !== true)
      .map(([ns, k, v]) => `${ns}.${k}=${v}`);
    check('D4: in-domain values for proven keys are accepted', rejected.length === 0, rejected.join(', '));
  } else {
    check('D4: every invalid value is refused', false, 'no validator');
    check('D4: in-domain values for proven keys are accepted', false, 'no validator');
  }
}

// ══ Allowlist shape ════════════════════════════════════════════════════════
{
  const specs = allowMod?.ALL_SPECS ?? null;
  check('allowlist: enumerable spec list is exported', Array.isArray(specs));
  if (Array.isArray(specs)) {
    const auto = specs.filter((s) => s.tier === 'auto');
    check('allowlist: exactly the two round-trip-proven keys are auto',
      auto.length === 2 &&
      auto.some((s) => s.namespace === 'secure' && s.key === 'long_press_timeout') &&
      auto.some((s) => s.namespace === 'global' && s.key === 'window_animation_scale'),
      auto.map((s) => `${s.namespace}.${s.key}`).join(', '));
    check('allowlist: every auto entry is round_trip_proven',
      auto.every((s) => s.evidence === 'round_trip_proven'),
      auto.map((s) => `${s.namespace}.${s.key}:${s.evidence}`).join(', '));

    const DANGEROUS = [
      'default_input_method', 'navigation_mode', 'enabled_accessibility_services',
      'accessibility_enabled', 'adb_enabled', 'stay_on_while_plugged_in',
      'wifi_on', 'bluetooth_on', 'airplane_mode_on', 'install_non_market_apps',
      'device_provisioned', 'location_mode',
    ];
    const bad = specs.filter((s) => s.tier === 'auto' && DANGEROUS.includes(s.key));
    check('allowlist: dangerous categories contain zero auto entries',
      bad.length === 0, bad.map((s) => s.key).join(', '));

    check('allowlist: no entry uses a wildcard or pattern',
      specs.every((s) => /^[a-z0-9_.]+$/.test(s.key) && !s.key.includes('*')),
      specs.filter((s) => !/^[a-z0-9_.]+$/.test(s.key)).map((s) => s.key).join(', '));
    check('allowlist: every entry declares an explicit namespace',
      specs.every((s) => ['system', 'secure', 'global'].includes(s.namespace)));
    check('allowlist: every entry declares an evidence level',
      specs.every((s) => ['round_trip_proven', 'same_value_only', 'absent', 'unproven'].includes(s.evidence)));
    check('allowlist: namespace+key pairs are unique',
      new Set(specs.map((s) => `${s.namespace}.${s.key}`)).size === specs.length);
  } else {
    for (const n of [
      'exactly the two round-trip-proven keys are auto',
      'every auto entry is round_trip_proven',
      'dangerous categories contain zero auto entries',
      'no entry uses a wildcard or pattern',
      'every entry declares an explicit namespace',
      'every entry declares an evidence level',
      'namespace+key pairs are unique',
    ]) check(`allowlist: ${n}`, false, 'no allowlist');
  }
}

// ══ getSettingMeta may label, never decide ═════════════════════════════════
{
  const cmp = stripTs(read('src/services/profileCompare.ts'));
  check('meta: restoreType no longer comes from getSettingMeta',
    !/restoreType:\s*meta\.restoreType/.test(cmp));
  check('meta: restoreType comes from the allowlist',
    /restoreAllowlist/.test(cmp) && /tierToRestoreType|spec\?\.tier|lookupSpec\(/.test(cmp));
}

// ══ The planner: the single decision point before any write ════════════════
{
  check('plan: a pure restore planner exists', !!planMod?.planRestore);
  if (planMod?.planRestore) {
    const capability = { system: true, secure: true, global: true };
    const rows = diff(
      {
        system: { zz_unknown_vendor_key: '0', screen_off_timeout: '15000' },
        secure: { zz_unknown_vendor_key: '0', long_press_timeout: '400', default_input_method: 'com.a/.B' },
        global: { zz_unknown_vendor_key: '0', window_animation_scale: '1.0', adb_enabled: '0' },
      },
      {
        system: { zz_unknown_vendor_key: '1', screen_off_timeout: '30000' },
        secure: { zz_unknown_vendor_key: '1', long_press_timeout: '1000', default_input_method: 'com.c/.D' },
        global: { zz_unknown_vendor_key: '1', window_animation_scale: '0.5', adb_enabled: '1' },
      },
    );
    const plan = planMod.planRestore(rows, capability);
    const written = (plan.writes || []).map((w) => `${w.namespace}.${w.key}`).sort();
    check('plan: only the two proven keys are planned for writing',
      written.length === 2 &&
      written[0] === 'global.window_animation_scale' &&
      written[1] === 'secure.long_press_timeout',
      written.join(', '));
    check('plan: every planned write carries the RAW source value',
      (plan.writes || []).every((w) => w.value === '400' || w.value === '1.0'),
      (plan.writes || []).map((w) => `${w.key}=${w.value}`).join(', '));
    check('plan: dangerous keys are excluded with a reason',
      (plan.excluded || []).some((e) => e.key === 'secure.default_input_method') &&
      (plan.excluded || []).some((e) => e.key === 'global.adb_enabled'));
    check('plan: unknown keys are excluded as not_allowlisted',
      (plan.excluded || []).filter((e) => e.reason === 'not_allowlisted').length >= 3);
    check('plan: without capability nothing is planned',
      (planMod.planRestore(rows, { system: false, secure: false, global: false }).writes || []).length === 0);
  } else {
    for (const n of [
      'only the two proven keys are planned for writing',
      'every planned write carries the RAW source value',
      'dangerous keys are excluded with a reason',
      'unknown keys are excluded as not_allowlisted',
      'without capability nothing is planned',
    ]) check(`plan: ${n}`, false, 'no planner');
  }
}

// ══ Adversarial matrix — a hostile profile must produce ZERO writes ════════
{
  const HOSTILE_KEYS = [
    'adb_enabled', 'enabled_accessibility_services', 'accessibility_enabled',
    'default_input_method', 'navigation_mode', 'install_non_market_apps',
    'device_provisioned', 'lock_screen_lock_after_timeout', 'lockscreen.password_salt',
    'wifi_on', 'bluetooth_on', 'airplane_mode_on', 'data_roaming',
    'package_verifier_enable', 'verifier_verify_adb_installs', 'location_mode',
    'zz_../../etc/passwd', 'zz_key with spaces', 'zz_key nul',
    'long_press_timeout_evil', 'xlong_press_timeout', 'LONG_PRESS_TIMEOUT',
    'window_animation_scale_evil', 'xwindow_animation_scale',
  ];
  const HOSTILE_VALUES = [
    '(not set)', 'ON', 'OFF', 'Samsung Keyboard', '', '   ',
    'com.evil.app/.Service', '99999999999', '-999', 'NaN', 'Infinity',
    'x'.repeat(10000), '1; rm -rf /', "1' OR '1'='1", '<script>', ' ',
  ];
  const oldS = {}, newS = {};
  let n = 0;
  for (const k of HOSTILE_KEYS) {
    for (const v of HOSTILE_VALUES) {
      const key = `${k}__${n++}`;
      oldS[key] = v;
      newS[key] = `${v}#`;
    }
    oldS[k] = HOSTILE_VALUES[n % HOSTILE_VALUES.length];
    newS[k] = 'changed';
  }
  // Also target the two proven keys with hostile VALUES, which must be
  // refused by validation even though the key itself is allowlisted.
  for (const [ns, k] of [['secure', 'long_press_timeout'], ['global', 'window_animation_scale']]) {
    void ns; void k;
  }
  const hostileOld = { system: { ...oldS }, secure: { ...oldS, long_press_timeout: '(not set)' }, global: { ...oldS, window_animation_scale: 'ON' } };
  const hostileNew = { system: { ...newS }, secure: { ...newS, long_press_timeout: '400' }, global: { ...newS, window_animation_scale: '1.0' } };

  const rows = diff(hostileOld, hostileNew);
  // A hostile KEY must never become writable. A hostile VALUE on a key that
  // is legitimately allowlisted may still show as automatic here -- it is
  // refused one layer down, by validation, which the zero-writes assertion
  // below is what actually binds.
  const allow = allowMod?.lookupSpec;
  const writableRows = rows.filter((d) => {
    if (!writable(d)) return false;
    if (!allow) return true;
    const cut = d.key.indexOf('.');
    const spec = allow(d.key.slice(0, cut), d.key.slice(cut + 1));
    return !spec || spec.tier !== 'auto';
  });
  check('adversarial: no hostile key becomes writable',
    writableRows.length === 0,
    `${writableRows.length} writable, e.g. ${writableRows.slice(0, 4).map((d) => `${d.key}:${d.restoreType}`).join(', ')}`);

  if (planMod?.planRestore) {
    const plan = planMod.planRestore(rows, { system: true, secure: true, global: true });
    check('adversarial: the planner attempts zero writes',
      (plan.writes || []).length === 0,
      (plan.writes || []).slice(0, 5).map((w) => `${w.namespace}.${w.key}=${w.value}`).join(', '));
  } else {
    check('adversarial: the planner attempts zero writes', false, 'no planner');
  }
  console.log(`     (adversarial matrix: ${HOSTILE_KEYS.length} keys x ${HOSTILE_VALUES.length} values = ${n} pairs, plus ${HOSTILE_KEYS.length} bare keys per namespace)`);
}

// ══ Native module: mirror, exact match, no novel rows ══════════════════════
{
  check('native: no SettingsProvider insert exists anywhere',
    !/contentResolver\.insert\(/.test(ktSrc),
    (ktSrc.match(/contentResolver\.insert\([^)]*\)/g) || []).join(' | '));
  check('native: the direct System fallback is update-only',
    !/fun writeSettingDirect[\s\S]{0,600}insert\(/.test(ktSrc));
  check('native: an allowlist mirror exists',
    /RESTORE_ALLOWLIST/.test(ktSrc));
  check('native: writes reject an unknown namespace/key pair',
    /not_allowlisted/.test(ktSrc));
  check('native: read-back verification is preserved',
    (ktSrc.match(/readBack/g) || []).length >= 3);
  check('native: coarse outcomes only, no value in the result',
    /write_succeeded/.test(ktSrc) && /write_failed/.test(ktSrc) &&
    /key_not_present/.test(ktSrc) && /unsupported_value/.test(ktSrc));

  // JS and native allowlists must agree exactly.
  const specs = allowMod?.ALL_SPECS ?? null;
  if (Array.isArray(specs)) {
    const ktBlock = (ktSrc.match(/RESTORE_ALLOWLIST[\s\S]*?\n    \)/) || [''])[0];
    const ktPairs = [...ktBlock.matchAll(/"(system|secure|global)\.([a-z0-9_.]+)"/g)]
      .map((m) => `${m[1]}.${m[2]}`).sort();
    // The native mirror is the WRITABLE set, i.e. tier 'auto' — not every
    // listed key. Guided and unsupported entries are never sent to the
    // native writer, so mirroring them there would make native laxer than
    // JS. Promoting a key to automatic must therefore touch both sides.
    const jsPairs = specs.filter((s) => s.tier === 'auto')
      .map((s) => `${s.namespace}.${s.key}`).sort();
    check('native: the JS and native allowlists match exactly',
      ktPairs.length > 0 && ktPairs.join('|') === jsPairs.join('|'),
      `native=[${ktPairs.join(',')}] js=[${jsPairs.join(',')}]`);
  } else {
    check('native: the JS and native allowlists match exactly', false, 'no allowlist');
  }
}

// ══ Outcome vocabulary ═════════════════════════════════════════════════════
{
  const OUTCOMES = ['not_allowlisted', 'unsupported_value', 'key_not_present',
                    'permission_missing', 'write_failed', 'write_succeeded'];
  for (const o of OUTCOMES) {
    check(`outcome: '${o}' is representable in the UI`, restoreSrc.includes(o));
  }
}

// ══ Unsupported data survives, and is not claimed as restored ═════════════
{
  const p = blank({ samsung: { aod_mode: '1' }, system: { zz_unknown_vendor_key: '1' } });
  const q = blank({ samsung: { aod_mode: '0' }, system: { zz_unknown_vendor_key: '0' } });
  check('preserved: the samsung bucket survives comparison untouched',
    p.settings.samsung.aod_mode === '1' && q.settings.samsung.aod_mode === '0');
  if (compareMod) {
    const r = compareMod.compareProfiles(p, q);
    check('preserved: an unsupported difference is still shown, as read-only',
      r.settings.some((d) => d.key === 'system.zz_unknown_vendor_key' && d.restoreType === 'info'));
    check('preserved: unsupported differences are counted as info, not auto',
      r.summary.autoRestoreCount === 0);
  } else {
    check('preserved: an unsupported difference is still shown, as read-only', false, 'no compare module');
    check('preserved: unsupported differences are counted as info, not auto', false, 'no compare module');
  }
  check('preserved: the UI labels unsupported data honestly',
    /Saved, not restorable/.test(restoreSrc));
}

// ══ Import compatibility ═══════════════════════════════════════════════════
{
  const V = validationMod?.validateAndMigrateProfile;
  if (V) {
    let v2 = null, v2err = '';
    try { v2 = V(blank({ system: { screen_off_timeout: '30000' } })); }
    catch (e) { v2err = String(e).split('\n')[0]; }
    check('compat: a v2 profile still imports',
      v2?.schemaVersion === 2 && v2.settings.system.screen_off_timeout === '30000', v2err);

    let v1 = null, v1err = '';
    try {
      v1 = V({
        schemaVersion: 1,
        exportedAt: '2026-01-01T00:00:00.000Z',
        device: { manufacturer: 'Samsung', model: 'SM-S928U', osVersion: '16' },
        settings: { system: { screen_off_timeout: '30000' }, secure: {}, global: {} },
        installedPackages: [],
      });
    } catch (e) { v1err = String(e).split('\n')[0]; }
    check('compat: a v1 profile still migrates and imports',
      v1?.schemaVersion === 2 && v1.settings.system.screen_off_timeout === '30000', v1err);

    // A profile carrying keys we will never write must still import intact.
    let v3 = null, v3err = '';
    try {
      v3 = V(blank({ system: { zz_unknown_vendor_key: '1' }, samsung: { aod_mode: '1' } }));
    } catch (e) { v3err = String(e).split('\n')[0]; }
    check('compat: unsupported data survives import intact',
      v3?.settings.system.zz_unknown_vendor_key === '1' &&
      v3?.settings.samsung.aod_mode === '1', v3err);
  } else {
    check('compat: a v2 profile still imports', false, 'no validation module');
    check('compat: a v1 profile still migrates and imports', false, 'no validation module');
    check('compat: unsupported data survives import intact', false, 'no validation module');
  }
}

// ══ Legacy metadata is documented, not deleted ═════════════════════════════
{
  const reg = read('src/data/settingsRegistry.ts');
  const samsungIds = [...reg.matchAll(/'samsung\.([A-Za-z0-9_.]+)':\s*\{/g)].map((m) => m[1]);
  check('legacy: all 22 samsung.* entries are still present',
    samsungIds.length === 22, String(samsungIds.length));
  check('legacy: global.auto_time is still present', /'global\.auto_time':/.test(reg));
  check('legacy: the unreachability mechanism is documented',
    /UNREACHABLE/.test(reg) && /profileCompare\.ts/.test(reg));
  check('legacy: auto_time documents the _time\\$ mechanism',
    /_time\$/.test(reg) && /IGNORED_SETTING_PATTERNS/.test(reg));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
