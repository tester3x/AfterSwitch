/**
 * System-write matrix harness proof.
 *
 * The harness mutates real device settings, so it cannot be exercised here.
 * These are structural assertions over the Kotlin, the bridge and the screen,
 * plus one EXECUTABLE model of the ordering and journal state machines. The
 * structural half is weaker than running the code and is labelled as such;
 * its job is to make it hard for a later edit to quietly remove a guard.
 *
 * Run: node scripts/test-system-matrix-probe.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();

let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name}${detail !== undefined ? ` -- ${detail}` : ''}`); }
};

const KT_PATH = 'plugins/android/DeviceSettingsModule.kt';
const kt = strip(read(KT_PATH));
const reader = read('src/services/settingsReader.ts');
const dev = read('src/screens/DevDiagnosticsScreen.tsx');
const plugin = strip(read('plugins/withDeviceSettings.js'));

function blockAt(src, from) {
  const open = src.indexOf('{', from);
  if (open < 0) return '';
  let d = 0, j = open;
  for (; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') { d--; if (d === 0) break; }
  }
  return src.slice(open, j + 1);
}
const ktFun = (n) => { const i = kt.indexOf(`fun ${n}(`); return i < 0 ? null : blockAt(kt, i); };

const TRIP = ktFun('matrixRoundTrip');
const PROBE = ktFun('matrixProbePresence');
const RECOVER = ktFun('matrixRecoverPendingRollback');

/**
 * ROUND 2 — only the two mutations the first run never reached.
 *
 * Keys 1-10 were completed and accepted from build 56a2b326. They must be
 * ABSENT from this build, not merely disabled, and the assertions below check
 * for their absence explicitly rather than only checking what is present.
 */
const ROUND_TRIP_KEYS = ['global.transition_animation_scale', 'system.font_scale'];
const PROBE_KEYS = ['secure.spell_checker_enabled', 'global.animator_duration_scale'];

/** Accepted in round 1; running any of them again would be a defect. */
const ALREADY_PROVEN = [
  'system.sound_effects_enabled', 'system.haptic_feedback_enabled',
  'system.accelerometer_rotation', 'system.screen_brightness_mode',
  'system.screen_off_timeout', 'system.volume_music', 'system.volume_notification',
  'system.volume_ring', 'system.volume_alarm', 'secure.show_ime_with_hard_keyboard',
];

// ── 1. The archive must contain the canonical source ──────────────────────
// This is the check that would have caught the 18130fdd build, which
// installed cleanly while missing a native method the bridge calls.
{
  let ignored = true;
  try { git('check-ignore', '-q', KT_PATH); } catch { ignored = false; }
  check('canonical Kotlin is NOT excluded by ignore rules', !ignored,
    ignored ? `${KT_PATH} is ignored -- EAS will not upload it` : undefined);
  const gi = read('.gitignore');
  check('.gitignore anchors the generated android dir to the root',
    /^\/android\/$/m.test(gi) && !/^android\/$/m.test(gi),
    'an unanchored android/ also matches plugins/android/');
  check('.gitignore anchors the generated ios dir to the root',
    /^\/ios\/$/m.test(gi) && !/^ios\/$/m.test(gi));
  let rootIgnored = false;
  try { git('check-ignore', '-q', 'android/app/build.gradle'); rootIgnored = true; } catch { /* */ }
  check('generated root android/ is still ignored', rootIgnored);
  check('canonical Kotlin is tracked by git', git('ls-files', KT_PATH) === KT_PATH);

  check('the plugin has NO inline Kotlin fallback constants',
    !/const DEVICE_SETTINGS_(MODULE|PACKAGE)_KT\s*=/.test(plugin));
  check('the plugin THROWS when the canonical source is missing',
    /missingSrc\.length > 0/.test(plugin) && /throw new Error\(/.test(plugin));
  check('the plugin never writes Kotlin from a string literal',
    !/writeFileSync\([^)]*DeviceSettings\w*\.kt[^)]*,\s*[A-Z_]{4,}/.test(plugin));
}

// ── 2. Exactly the authorised matrix, in the right namespaces ─────────────
{
  check('the native round-trip order exists', /MATRIX_ORDER = listOf\(/.test(kt));
  const orderBlock = (kt.match(/MATRIX_ORDER = listOf\(([\s\S]*?)\n    \)/) || ['', ''])[1];
  const ktOrder = [...orderBlock.matchAll(/"([a-z]+\.[a-z0-9_]+)"/g)].map((m) => m[1]);
  check('the native order is exactly the two remaining keys',
    ktOrder.length === 2 && ktOrder.join('|') === ROUND_TRIP_KEYS.join('|'),
    ktOrder.join(', '));
  check('font_scale is LAST, because its write recreates the activity',
    ktOrder[ktOrder.length - 1] === 'system.font_scale');
  check('one global, one system',
    ktOrder.filter((k) => k.startsWith('global.')).length === 1 &&
    ktOrder.filter((k) => k.startsWith('system.')).length === 1);

  check('this build carries a distinguishing tag an older artifact cannot have',
    /MATRIX_BUILD_TAG = "afterswitch-matrix-round2"/.test(kt) &&
    /fun matrixBuildTag\(/.test(kt));

  const probeBlock = (kt.match(/MATRIX_PROBES = listOf\(([\s\S]*?)\n    \)/) || ['', ''])[1];
  const ktProbes = [...probeBlock.matchAll(/"([a-z]+\.[a-z0-9_]+)"/g)].map((m) => m[1]);
  check('the native probe list is exactly the two absent keys',
    ktProbes.join('|') === PROBE_KEYS.join('|'), ktProbes.join(', '));

  // The ten accepted keys must be UNREACHABLE, not merely unlisted in the UI.
  const reachable = ALREADY_PROVEN.filter((k) => ktOrder.includes(k) || ktProbes.includes(k));
  check('no already-proven key can be run again',
    reachable.length === 0, reachable.join(', '));
  const jsAll = reader.match(/MATRIX_ORDER = \[([\s\S]*?)\n\] as const/)?.[1] ?? '';
  const jsReachable = ALREADY_PROVEN.filter((k) => jsAll.includes(`'${k}'`));
  check('no already-proven key is reachable from the JS bridge either',
    jsReachable.length === 0, jsReachable.join(', '));

  const jsOrder = (reader.match(/MATRIX_ORDER = \[([\s\S]*?)\n\] as const/) || ['', ''])[1];
  const jsKeys = [...jsOrder.matchAll(/'([a-z]+\.[a-z0-9_]+)'/g)].map((m) => m[1]);
  check('JS and native round-trip lists match exactly',
    jsKeys.join('|') === ktOrder.join('|'), jsKeys.join(', '));
  const jsProbe = (reader.match(/MATRIX_PROBES = \[([\s\S]*?)\n\] as const/) || ['', ''])[1];
  const jsProbeKeys = [...jsProbe.matchAll(/'([a-z]+\.[a-z0-9_]+)'/g)].map((m) => m[1]);
  check('JS and native probe lists match exactly',
    jsProbeKeys.join('|') === ktProbes.join('|'), jsProbeKeys.join(', '));

  check('the JS bridge refuses anything off the round-trip list',
    /if \(!\(MATRIX_ORDER as readonly string\[\]\)\.includes\(fullKey\)\) return 'error';/.test(reader));
  check('the JS bridge refuses anything off the probe list',
    /if \(!\(MATRIX_PROBES as readonly string\[\]\)\.includes\(fullKey\)\) return 'error';/.test(reader));

  // No dangerous key may appear in either list.
  const FORBIDDEN = ['adb_enabled', 'enabled_accessibility_services', 'default_input_method',
    'navigation_mode', 'wifi_on', 'bluetooth_on', 'stay_on_while_plugged_in',
    'install_non_market_apps', 'device_provisioned', 'lock', 'password', 'biometric'];
  const offenders = FORBIDDEN.filter((f) => ktOrder.some((k) => k.includes(f)) || ktProbes.some((k) => k.includes(f)));
  check('no security, accessibility, input, radio or admin key is in the matrix',
    offenders.length === 0, offenders.join(', '));
}

// ── 3. The production restore path is untouched by the experiment ─────────
{
  const SAFETY = '9f08811b9be4310ff3962f74f8988e16e941bc89';
  const PROD = [
    'src/data/restoreAllowlist.ts', 'src/services/restorePlan.ts',
    'src/services/profileCompare.ts', 'src/screens/RestoreScreen.tsx',
    'src/types/profile.ts',
  ];
  let changed = [];
  try {
    changed = git('diff', '--name-only', SAFETY, '--', ...PROD).split('\n').filter(Boolean);
  } catch { changed = ['(git diff failed)']; }
  check('the production restore path is byte-identical to the safety branch',
    changed.length === 0, changed.join(', '));

  const allow = read('src/data/restoreAllowlist.ts');
  const autos = [...allow.matchAll(/namespace: '([a-z]+)',\s*\n\s*key: '([a-z0-9_]+)',\s*\n\s*tier: 'auto'/g)]
    .map((m) => `${m[1]}.${m[2]}`);
  check('the production auto tier is still exactly the two proven keys',
    autos.length === 2 &&
    autos.includes('secure.long_press_timeout') &&
    autos.includes('global.window_animation_scale'), autos.join(', '));
  check('the native production mirror is still exactly those two',
    /RESTORE_ALLOWLIST = setOf\(\s*"secure\.long_press_timeout",\s*"global\.window_animation_scale"\s*\)/
      .test(kt.replace(/\r\n/g, '\n')));
}

// ── 4. One at a time, in order ────────────────────────────────────────────
{
  check('a single-flight latch exists',
    /matrixInFlight\.compareAndSet\(false, true\)/.test(TRIP || ''));
  check('the latch is released in finally',
    /matrixInFlight\.set\(false\)/.test(blockAt(TRIP || '', (TRIP || '').indexOf('} finally {') + 2)));
  check('a key out of sequence is refused before anything is read',
    /if \(index != matrixNextIndex\)[\s\S]{0,120}out_of_order/.test(TRIP || '') &&
    (TRIP || '').indexOf('out_of_order') < (TRIP || '').indexOf('matrixRead('));
  check('the gate advances only after a verified restoration',
    /if \(index == matrixNextIndex\) matrixNextIndex = index \+ 1/.test(TRIP || '') &&
    /if \(!restoreOk\)[\s\S]{0,400}matrixRestorationFailed = true/.test(TRIP || ''));
  check('the UI re-reads the gate from native rather than assuming it advanced',
    /setNextIndex\(await matrixNextAllowedIndex\(\)/.test(dev));
  check('the UI disables every key except the next one',
    /const locked = i !== nextIndex;/.test(dev) && /disabled=\{off\}/.test(dev));
  check('a synchronous latch blocks a double tap',
    /const inFlight = useRef\(false\)/.test(dev) && /if \(inFlight\.current\) return;/.test(dev));
}

// ── 5. Journal before mutation; cleared only after verified restoration ───
{
  const t = TRIP || '';
  const iJ = t.indexOf('matrixWriteJournal(namespace, key, current, "pending")');
  const iM = t.indexOf('matrixWrite(namespace, key, alternate)');
  check('the journal is written BEFORE the mutation', iJ > 0 && iJ < iM);
  const wj = ktFun('matrixWriteJournal');
  check('the journal write is forced to disk, not left in a buffer',
    /out\.flush\(\)/.test(wj || '') && /out\.channel\.force\(true\)/.test(wj || ''));
  check('the journal records namespace, key, original and state',
    ['namespace', 'key', 'original', 'state'].every((f) => new RegExp(`put\\("${f}"`).test(wj || '')));
  check('the journal lives in this package private storage',
    /java\.io\.File\(reactContext\.filesDir, MATRIX_JOURNAL\)/.test(kt));
  check('the journal filename is distinct from the earlier experiment',
    /MATRIX_JOURNAL = "afterswitch-matrix-rollback\.json"/.test(kt));

  const FIN = blockAt(t, t.indexOf('} finally {') + 2);
  check('the exact original is restored inside finally',
    /matrixWrite\(namespace, key, toRestore\)/.test(FIN) && /val toRestore = original/.test(FIN));
  check('the restoration is verified by a FRESH read inside finally',
    /restoreOk = matrixRead\(namespace, key\) == toRestore/.test(FIN));
  check('restore happens on the exception paths too (it is in finally)',
    !/matrixWrite\(namespace, key, toRestore/.test(t.slice(0, t.indexOf('} finally {'))));
  check('the journal is cleared only in the verified-restoration branch',
    FIN.indexOf('matrixClearJournal()') > FIN.indexOf('if (!restoreOk)'));
  check('a failed restoration KEEPS the journal and latches the block',
    /matrixRestorationFailed = true/.test(FIN) &&
    FIN.slice(FIN.indexOf('if (!restoreOk)'), FIN.indexOf('matrixClearJournal()')).indexOf('matrixClearJournal()') === -1);
  check('the change is verified by a FRESH read, not the write return',
    /if \(matrixRead\(namespace, key\) == alternate\) "round_trip_succeeded"/.test(t));
}

// ── 6. Startup recovery before any control renders ────────────────────────
{
  check('recovery is awaited before the capability checks',
    dev.indexOf('matrixRecoverPendingRollback()') < dev.indexOf('canWriteSystemSettings()'));
  check('no test section renders until recovery reports clean',
    /const recoveryClean =/.test(dev) && /\{recoveryClean && !blocked && \(/.test(dev));
  check('a pending rollback is surfaced as a stop, not hidden',
    /\{recovery !== null && !recoveryClean && \(/.test(dev));
  check('recovery restores the exact journalled original and verifies it',
    /matrixWrite\(namespace, key, original\)/.test(RECOVER || '') &&
    /if \(matrixRead\(namespace, key\) == original\)/.test(RECOVER || ''));
  check('an unparseable journal is NOT treated as absent',
    /if \(obj == null\) \{[\s\S]{0,160}pending_rollback_restore_failed/.test(RECOVER || ''));
  check('a journal naming an off-matrix key is refused, not restored',
    /!MATRIX_ORDER\.contains\("\$namespace\.\$key"\)/.test(RECOVER || ''));
  check('an unreachable bridge fails CLOSED for recovery',
    /if \(!isNativeModuleAvailable\(\)\) return 'error';[\s\S]{0,140}matrixRecoverPendingRollback/.test(reader));
  check('an unreachable bridge fails CLOSED for the presence query',
    /if \(!isNativeModuleAvailable\(\)\) return true;[\s\S]{0,140}matrixRollbackPending/.test(reader));
}

// ── 7. The two permissions are never conflated ────────────────────────────
{
  check('a System-specific capability check exists',
    /fun canWriteSystemSettings\(/.test(kt) && /Settings\.System\.canWrite\(reactContext\)/.test(kt));
  check('the round trip picks the permission by namespace',
    /if \(namespace == "system"\) Settings\.System\.canWrite\(reactContext\)/.test(TRIP || '') &&
    /else hasMatrixSecurePermission\(\)/.test(TRIP || ''));
  check('the bridge exposes the System capability separately',
    /export async function canWriteSystemSettings/.test(reader));
  check('the screen shows both grants, separately',
    /WRITE_SETTINGS \(system/.test(dev) && /WRITE_SECURE_SETTINGS \(secure/.test(dev));
  check('the screen states the two grants are not the same thing',
    /two different grants/.test(dev));
}

// ── 8. The probes never write ─────────────────────────────────────────────
{
  check('the probe contains no write of any kind',
    PROBE !== null && !/matrixWrite\(|putString|putInt|putFloat/.test(PROBE));
  check('the probe reads the row, then inspects declared constants',
    /matrixRead\(namespace, key\) != null/.test(PROBE || '') &&
    /cls\.declaredFields/.test(PROBE || ''));
  check('the probe matches on field NAME, which hidden-API rules leave readable',
    /val wanted = key\.uppercase\(\)/.test(PROBE || '') && /f\.name == wanted/.test(PROBE || ''));
  check('the probe result vocabulary admits its own limit',
    /absent_key_not_in_public_sdk/.test(kt) && /INCONCLUSIVE/.test(dev));
}

// ── 9. Nothing leaks, nothing creates a row ───────────────────────────────
{
  const COARSE = ['round_trip_succeeded', 'key_not_present',
    'change_write_failed_original_intact', 'change_not_persisted_original_restored',
    'restore_succeeded_after_test_failure', 'restore_failed_stop_immediately',
    'permission_missing', 'unsupported_value', 'out_of_order', 'error'];
  const resolves = (TRIP || '').match(/promise\.resolve\(([^)]*)\)/g) || [];
  check('every round-trip resolve is a coarse status, never a value',
    resolves.length > 0 &&
    resolves.every((r) => COARSE.some((c) => r.includes(`"${c}"`)) || /outcome \?: "error"/.test(r)),
    resolves.join(' | '));
  check('the harness logs nothing',
    !/Log\.|println/.test(TRIP || '') && !/Log\.|println/.test(PROBE || '') &&
    !/Log\.|println/.test(RECOVER || ''));
  check('no exception text is ever resolved',
    !/promise\.resolve\([^)]*(e\.message|e\.toString|\$\{e)/.test(kt));
  check('an absent key is refused before the journal and before any write',
    (TRIP || '').indexOf('if (current == null)') < (TRIP || '').indexOf('matrixWriteJournal(') &&
    (TRIP || '').indexOf('if (current == null)') < (TRIP || '').indexOf('matrixWrite(namespace, key, alternate)'));
  check('the production native writer still refuses to insert a row',
    !/contentResolver\.insert\(/.test(kt));
  check('the screen renders no setting value',
    !/\{value\}|\{current\}|\{original\}|\{alternate\}/.test(dev));
}

// ── 10. Alternate values stay inside the production domains ───────────────
{
  const alt = ktFun('matrixAlternate');
  check('an alternate selector exists', alt !== null);
  // Round 2 exercises exactly two keys, so the selector must contain exactly
  // two rules. Arms for the ten accepted keys were removed, not left
  // unreachable — the artifact gate flagged their strings in the compiled
  // dex, and a build that still knows how to mutate a key it must never run
  // is a build whose contents do not match its purpose.
  {
    const arms = (alt || '').match(/^\s*"[a-z]+\.[a-z0-9_]+"/gm) || [];
    check('the alternate selector has exactly two rules',
      arms.length === 2, arms.map((a) => a.trim()).join(', '));
    const stale = ALREADY_PROVEN.filter((k) => (alt || '').includes(`"${k}"`));
    check('no accepted key retains an alternate-value rule',
      stale.length === 0, stale.join(', '));
  }
  check('transition_animation_scale stays within 0..10 and never picks zero',
    /f < 0f \|\| f > 10f/.test(alt || '') && /if \(f == 1\.0f\) "0\.5" else "1\.0"/.test(alt || ''));
  check('font_scale stays within the production float domain 0.5..2',
    /f < 0\.5f \|\| f > 2\.0f/.test(alt || '') && /if \(f == 1\.0f\) "1\.15" else "1\.0"/.test(alt || ''));
  check('an out-of-domain original yields no alternate, so nothing is written',
    /else -> null/.test(alt || '') &&
    /alternate == null \|\| alternate == current/.test(TRIP || ''));

  // The experiment must not exercise a key under looser bounds than
  // production will later write it under.
  const allow = read('src/data/restoreAllowlist.ts');
  const prodDomains = {
    'screen_off_timeout': /min: 15000, max: 1800000/,
    'font_scale': /min: 0\.5, max: 2/,
    'volume_ring': /min: 0, max: 30/,
    'transition_animation_scale': /min: 0, max: 10/,
  };
  const mismatched = Object.entries(prodDomains).filter(([, re]) => !re.test(allow)).map(([k]) => k);
  check('the experiment domains match the production validator domains',
    mismatched.length === 0, mismatched.join(', '));
}

// ── 11. EXECUTABLE: ordering and journal survive a crash at any step ──────
{
  // A model of the specified state machines, not the Kotlin. Runs for real
  // with process death injected before each step.
  const ORIGINAL = 'ORIG', ALT = 'ALT';

  function run(world, dieAfter) {
    let step = 0;
    const tick = () => { step += 1; if (step > dieAfter) throw new Error('death'); };
    try {
      tick(); if (world.journal) return world;
      tick(); if (world.index !== world.attempt) return world;      // out of order
      tick(); const cur = world.setting;
      tick(); if (cur === null) return world;
      tick(); world.journal = { original: cur, state: 'pending' };  // fsynced
      tick(); world.setting = ALT;
      tick(); void (world.setting === ALT);
      tick(); world.setting = world.journal.original;               // finally
      tick(); if (world.setting !== world.journal.original) return world;
      tick(); world.journal.state = 'verified';
      tick(); world.journal = null;
      tick(); world.index += 1;                                      // gate advances
    } catch { /* process death */ }
    return world;
  }
  function recover(w) {
    if (!w.journal) return w;
    if (w.journal.state === 'verified') { w.journal = null; return w; }
    w.setting = w.journal.original;
    if (w.setting === w.journal.original) w.journal = null;
    return w;
  }

  let safe = true, firstBad = null, gateLeaked = null;
  for (let d = 0; d <= 14; d++) {
    const w = recover(run({ setting: ORIGINAL, journal: null, index: 0, attempt: 0 }, d));
    if (!(w.setting === ORIGINAL && w.journal === null) && firstBad === null) {
      safe = false; firstBad = d;
    }
    // The gate must never advance past a step that did not complete.
    if (w.index > 1 && gateLeaked === null) gateLeaked = d;
  }
  check('MODEL: crash at any step leaves the original restored and no journal',
    safe, firstBad === null ? undefined : `first unsafe crash point: step ${firstBad}`);
  check('MODEL: the ordering gate never advances more than one key',
    gateLeaked === null, `advanced twice at crash point ${gateLeaked}`);

  // Out-of-order attempts must be refused with nothing touched.
  const w = run({ setting: ORIGINAL, journal: null, index: 0, attempt: 3 }, 99);
  check('MODEL: an out-of-order key touches nothing',
    w.setting === ORIGINAL && w.journal === null && w.index === 0);

  // Journalling AFTER the mutation would strand the value -- the inversion
  // the Kotlin must not have.
  const t = TRIP || '';
  check('the Kotlin implements the safe order the model requires',
    t.indexOf('matrixWriteJournal(namespace, key, current, "pending")') <
    t.indexOf('matrixWrite(namespace, key, alternate)'));
}

// ── 12. Isolation: the diagnostic build cannot reach production ───────────
{
  check('a diagnostic entry point exists', existsSync(join(root, 'index.diagnostic.js')));
  const entry = read('index.diagnostic.js');
  check('the entry point never imports App.tsx', !/from '\.\/App'/.test(entry));
  check('the entry point renders only the diagnostic screen',
    /DevDiagnosticsScreen/.test(entry) && !/RestoreScreen|ScanScreen|firebase/i.test(strip(entry)));
  check('package.json main points at the diagnostic entry',
    JSON.parse(read('package.json')).main === 'index.diagnostic.js');

  const cfg = read('app.config.js');
  check('diag mode uses a separate applicationId',
    /package: 'com\.afterswitch\.app\.devdiag'/.test(cfg));
  check('diag mode drops googleServicesFile', /delete expo\.android\.googleServicesFile/.test(cfg));
  check('diag mode drops the production intent filters',
    /delete expo\.android\.intentFilters/.test(cfg));
  check('diag mode uses a separate scheme', /scheme = 'afterswitch-devdiag'/.test(cfg));
  check('without the env flag the config is a pass-through',
    /if \(!DIAG\) return expo;/.test(cfg));

  const eas = JSON.parse(read('eas.json'));
  check('the diagnostic EAS profile is internal and sets the flag',
    eas.build['diagnostic-apk']?.distribution === 'internal' &&
    eas.build['diagnostic-apk']?.env?.AFTERSWITCH_DIAG === '1' &&
    eas.build['diagnostic-apk']?.android?.buildType === 'apk');

  // No production caller may reach the harness.
  const CALLERS = ['App.tsx', 'src/services/profileBuilder.ts', 'src/services/quickCheck.ts',
    'src/services/profileIO.ts', 'src/services/profileCompare.ts', 'src/services/restorePlan.ts',
    'src/screens/RestoreScreen.tsx', 'src/screens/ScanScreen.tsx', 'src/screens/HomeScreen.tsx',
    'src/screens/CompareScreen.tsx', 'src/screens/BrowseScreen.tsx',
    'src/components/GuidedWizard.tsx'];
  const offenders = CALLERS.filter((p) => /matrixRoundTrip\s*\(|matrixProbePresence\s*\(/.test(read(p)));
  check('no production path calls the harness', offenders.length === 0, offenders.join(', '));
  check('the dev screen is the only caller', /matrixRoundTrip\(/.test(dev));
  check('the screen does NOT gate on a development flag (EAS release bundle)',
    !strip(dev).includes('__DEV__'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
