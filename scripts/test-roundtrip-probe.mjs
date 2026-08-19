/**
 * Changed-value round-trip safety proof.
 *
 * The probe mutates a real device setting, so it cannot be exercised here.
 * Two kinds of assertion follow, and they are NOT equally strong:
 *
 *   STRUCTURAL — ordering and containment checks over the Kotlin and TSX
 *     sources. Weaker than running the code. Their job is to make it hard
 *     for a later edit to quietly remove a guard.
 *
 *   EXECUTABLE — a model of the rollback-journal state machine, run for real
 *     in this process with a crash injected at every step. The model is not
 *     the Kotlin; it is the specification the Kotlin is asserted to mirror.
 *     A green model plus green structural checks is still not a device test.
 *
 * One required assertion lives elsewhere: "cleanup refuses to uninstall while
 * a rollback is pending" is proven in the experiment bundle's own suite
 * (Test-BundleSafety.mjs), because the cleanup script is a PowerShell file
 * outside this repository. The app-side half of that contract — a presence-
 * only query with no value in it — is asserted here.
 *
 * Run: node scripts/test-roundtrip-probe.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const stripKt = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name}${detail !== undefined ? ` -- ${detail}` : ''}`); }
};

const kt = stripKt(read('plugins/android/DeviceSettingsModule.kt'));
const reader = read('src/services/settingsReader.ts');
const dev = read('src/screens/DevDiagnosticsScreen.tsx');

/** Brace-matched block starting at the first `{` at or after `from`. */
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
const ktFun = (name) => {
  const i = kt.indexOf(`fun ${name}(`);
  return i < 0 ? null : blockAt(kt, i);
};

const TRIP = ktFun('diagnosticRoundTrip');
const RECOVER = ktFun('diagnosticRecoverPendingRollback');
const PENDING = ktFun('diagnosticRollbackPending');

const COARSE = [
  'round_trip_succeeded', 'key_not_present', 'change_write_failed_original_intact',
  'change_not_persisted_original_restored', 'restore_succeeded_after_test_failure',
  'restore_failed_stop_immediately', 'permission_missing', 'error',
];

// ── 1. Exactly two allowlisted keys, in the correct namespaces ────────────
{
  check('the round-trip probe exists', TRIP !== null);
  check('the startup recovery exists', RECOVER !== null);
  check('the presence query exists', PENDING !== null);

  check('secure allowlist is exactly long_press_timeout',
    /ROUNDTRIP_SECURE_KEYS = setOf\("long_press_timeout"\)/.test(kt));
  check('global allowlist is exactly window_animation_scale',
    /ROUNDTRIP_GLOBAL_KEYS = setOf\("window_animation_scale"\)/.test(kt));

  const sets = (kt.match(/ROUNDTRIP_(SECURE|GLOBAL)_KEYS = setOf\(([^)]*)\)/g) || []).join('\n');
  check('the native round-trip allowlist holds exactly two keys',
    (sets.match(/"[a-z_]+"/g) || []).length === 2, sets.replace(/\s+/g, ' '));

  check('long_press_timeout is routed to Settings.Secure and never to Global',
    /"secure" -> ROUNDTRIP_SECURE_KEYS/.test(TRIP || '') &&
    !/ROUNDTRIP_GLOBAL_KEYS[\s\S]{0,40}long_press_timeout/.test(kt));
  check('window_animation_scale is routed to Settings.Global and never to Secure',
    /"global" -> ROUNDTRIP_GLOBAL_KEYS/.test(TRIP || '') &&
    !/ROUNDTRIP_SECURE_KEYS[\s\S]{0,40}window_animation_scale/.test(kt));
  check('namespace routing reaches the right provider',
    /if \(namespace == "secure"\) Settings\.Secure\.getString/.test(kt) &&
    /if \(namespace == "secure"\) Settings\.Secure\.putString/.test(kt));

  check('an unknown namespace is refused before anything is read',
    (TRIP || '').indexOf('else -> {') > 0 &&
    (TRIP || '').indexOf('else -> {') < (TRIP || '').indexOf('readValue('));
  check('an off-allowlist key is refused before anything is read',
    (TRIP || '').indexOf('!allowed.contains(key)') > 0 &&
    (TRIP || '').indexOf('!allowed.contains(key)') < (TRIP || '').indexOf('readValue('));

  const jsTrip = (reader.match(/ROUNDTRIP_KEYS = \{([\s\S]*?)\n\}/) || ['', ''])[1];
  check('the JS allowlist holds exactly two keys',
    (jsTrip.match(/'[a-z_]+'/g) || []).length === 2, jsTrip.replace(/\s+/g, ' '));
  check('the JS wrapper refuses off-allowlist keys before the bridge',
    /const allowed: readonly string\[\] = ROUNDTRIP_KEYS\[namespace\];[\s\S]{0,300}if \(!allowed\.includes\(key\)\) return 'error';/
      .test(reader));
}

// ── 2. A DIFFERENT value is written, and its domain is bounded ────────────
{
  const alt = ktFun('alternateFor');
  check('an alternate-value selector exists', alt !== null);
  check('the alternate is derived from the original, never a bare constant write',
    /writeValue\(namespace, key, alternate, resolver\)/.test(TRIP || '') &&
    /val alternate = alternateFor\(key, current\)/.test(TRIP || ''));
  check('an alternate equal to the original is refused (the write must CHANGE it)',
    /alternate == null \|\| alternate == current/.test(TRIP || ''));

  check('long_press_timeout picks from the three delays the platform offers',
    /listOf\(400, 1000, 1500\)\.first \{ it != n \}/.test(alt || ''));
  check('long_press_timeout validates the original is an in-range integer',
    /toIntOrNull\(\)/.test(alt || '') && /n < 100 \|\| n > 5000/.test(alt || ''));
  check('window_animation_scale validates the original is an in-range float',
    /toFloatOrNull\(\)/.test(alt || '') && /f < 0f \|\| f > 10f/.test(alt || ''));
  check('window_animation_scale never selects zero (which disables animation)',
    /if \(f == 1\.0f\) "0\.5" else "1\.0"/.test(alt || ''));
  check('an out-of-domain original, or an unknown key, yields no alternate',
    /n > 5000\) null/.test(alt || '') &&
    /f > 10f\) null/.test(alt || '') &&
    /else -> null/.test(alt || ''));

  // Nothing security-, accessibility-, network-, input- or admin-related.
  const FORBIDDEN = [
    'adb_enabled', 'enabled_accessibility_services', 'accessibility_enabled',
    'default_input_method', 'navigation_mode', 'wifi_on', 'bluetooth_on',
    'stay_on_while_plugged_in', 'install_non_market_apps', 'device_provisioned',
    'lock_screen', 'screen_off_timeout', 'airplane_mode_on',
  ];
  const offenders = FORBIDDEN.filter((k) =>
    new RegExp(`ROUNDTRIP_(SECURE|GLOBAL)_KEYS = setOf\\([^)]*${k}`).test(kt));
  check('no security, accessibility, network, input or admin key is allowlisted',
    offenders.length === 0, offenders.join(','));
}

// ── 3. Fresh reads verify BOTH the change and the restoration ─────────────
{
  const t = TRIP || '';
  const iJournal = t.indexOf('writeJournal(namespace, key, current, "pending")');
  const iMutate = t.indexOf('writeValue(namespace, key, alternate, resolver)');
  const iVerify = t.indexOf('val after = readValue(namespace, key, resolver)');

  check('the change is verified by a FRESH read, not the write return value',
    iVerify > iMutate && /outcome = if \(after == alternate\)/.test(t));
  check('a non-persisting change is reported, not silently passed',
    t.includes('change_not_persisted_original_restored'));

  const iFinally = t.indexOf('} finally {');
  const FIN = iFinally < 0 ? '' : blockAt(t, iFinally + 2);
  check('a finally block exists', FIN.length > 0);
  check('the EXACT original is restored inside finally',
    /writeValue\(namespace, key, toRestore, resolver\)/.test(FIN) &&
    /val toRestore = original/.test(FIN));
  check('the restoration is verified by a FRESH read inside finally',
    /restoreOk = readValue\(namespace, key, resolver\) == toRestore/.test(FIN));
  check('restore happens on the exception paths too (it is in finally, not the try)',
    !/writeValue\(namespace, key, toRestore/.test(t.slice(0, iFinally)));
  check('the promise resolves from finally, so no path can return silently',
    /promise\.resolve\(outcome \?: "error"\)/.test(FIN));
}

// ── 4. Journal before mutation; cleared only after verified restoration ───
{
  const t = TRIP || '';
  const iJournal = t.indexOf('writeJournal(namespace, key, current, "pending")');
  const iMutate = t.indexOf('writeValue(namespace, key, alternate, resolver)');
  check('the journal is written BEFORE the mutation', iJournal > 0 && iJournal < iMutate);

  const wj = ktFun('writeJournal');
  check('the journal write is flushed to disk, not left in a buffer',
    /out\.flush\(\)/.test(wj || '') && /out\.channel\.force\(true\)/.test(wj || ''));
  check('the journal records namespace, key, original and state',
    /put\("namespace"/.test(wj || '') && /put\("key"/.test(wj || '') &&
    /put\("original"/.test(wj || '') && /put\("state"/.test(wj || ''));
  check('the journal lives in this package private files directory',
    /java\.io\.File\(reactContext\.filesDir, "afterswitch-diagnostic-rollback\.json"\)/.test(kt));

  const iFinally = t.indexOf('} finally {');
  const FIN = blockAt(t, iFinally + 2);
  const iRestoreOk = FIN.indexOf('if (!restoreOk)');
  const iClear = FIN.indexOf('clearJournal()');
  check('the journal is cleared only in the verified-restoration branch',
    iClear > iRestoreOk && iRestoreOk > 0 &&
    /journalWritten && toRestore != null/.test(FIN));
  check('a failed restoration KEEPS the journal',
    /restorationFailed = true/.test(FIN) &&
    FIN.slice(iRestoreOk, iClear).indexOf('clearJournal()') === -1);
  check('the state field moves to verified before the journal is removed',
    /writeJournal\(namespace, key, toRestore, "verified"\)[\s\S]{0,120}clearJournal\(\)/.test(FIN));
}

// ── 5. Startup recovery runs before the UI offers any test ────────────────
{
  check('recovery is exposed to JS', /export async function diagnosticRecoverPendingRollback/.test(reader));
  check('an unreachable bridge fails CLOSED for recovery',
    /if \(!isNativeModuleAvailable\(\)\) return 'error';[\s\S]{0,120}diagnosticRecoverPendingRollback/.test(reader));
  check('an unreachable bridge fails CLOSED for the presence query',
    /if \(!isNativeModuleAvailable\(\)\) return true;[\s\S]{0,120}diagnosticRollbackPending/.test(reader));

  check('the screen runs recovery inside the mount effect',
    /await diagnosticRecoverPendingRollback\(\)/.test(dev));
  check('recovery is awaited BEFORE the capability check',
    dev.indexOf('diagnosticRecoverPendingRollback()') < dev.indexOf('await secureWriteCapability()'));
  check('no test section renders until recovery reports clean',
    /const recoveryClean =\s*\n?\s*recovery === 'no_pending_rollback' \|\| recovery === 'pending_rollback_restored';/.test(dev) &&
    /\{recoveryClean && !blocked && \(/.test(dev));
  check('a pending rollback is surfaced as a stop, not hidden',
    /\{recovery !== null && !recoveryClean && \(/.test(dev));

  check('recovery restores the exact journalled original',
    /writeValue\(namespace, key, original, resolver\)/.test(RECOVER || ''));
  check('recovery verifies by a fresh read before clearing',
    /if \(readValue\(namespace, key, resolver\) == original\)/.test(RECOVER || '') &&
    /clearJournal\(\)/.test(RECOVER || ''));
  check('an unparseable journal is NOT treated as absent',
    /if \(obj == null\) \{[\s\S]{0,160}pending_rollback_restore_failed/.test(RECOVER || ''));
  check('a journal naming an off-allowlist key is refused, not restored',
    /allowed == null \|\| !allowed\.contains\(key\)/.test(RECOVER || ''));
  check('recovery re-checks the permission rather than assuming it',
    /checkSelfPermission/.test(RECOVER || ''));
}

// ── 6. A restoration failure blocks every further test ────────────────────
{
  check('the native probe refuses to start while a journal exists',
    /if \(restorationFailed \|\| rollbackFile\.exists\(\)\) \{[\s\S]{0,120}restore_failed_stop_immediately/
      .test(TRIP || ''));
  check('a failed restoration latches restorationFailed for the process',
    /@Volatile private var restorationFailed = false/.test(kt));
  check('a failed recovery latches it too',
    /restorationFailed = true/.test(RECOVER || ''));
  check('global will not run while secure restoration is unverified (native)',
    /if \(namespace == "global" && !secureRoundTripClean\)/.test(TRIP || ''));
  check('a failed restoration clears the secure-clean flag',
    /secureRoundTripClean = false/.test(TRIP || ''));
  check('only one round trip runs at a time (native latch)',
    /roundTripInFlight\.compareAndSet\(false, true\)/.test(TRIP || ''));
  check('the native latch is released in finally',
    /roundTripInFlight\.set\(false\)/.test(blockAt(TRIP || '', (TRIP || '').indexOf('} finally {') + 2)));

  check('global will not run while secure restoration is unverified (UI)',
    /const secureVerified =[\s\S]{0,160}secureTrip !== 'restore_failed_stop_immediately'/.test(dev) &&
    /const gated = namespace === 'global' && !secureVerified;/.test(dev));
  check('a stop outcome hides every test section',
    /const blocked = Object\.keys\(tripResults\)\.some\(/.test(dev) &&
    /tripResults\[k\] === 'restore_failed_stop_immediately'/.test(dev));
  check('the stop outcome is still shown to the operator',
    /\{blocked && \(/.test(dev) && /TRIP_TEXT\.restore_failed_stop_immediately/.test(dev));
  check('the UI latch releases the button on every path',
    /finally \{[\s\S]{0,120}setRunning\(null\);[\s\S]{0,60}inFlight\.current = false;/.test(dev));
}

// ── 7. A missing key never creates a row ──────────────────────────────────
{
  const t = TRIP || '';
  const iNull = t.indexOf('if (current == null)');
  const iJournal = t.indexOf('writeJournal(');
  const iMutate = t.indexOf('writeValue(namespace, key, alternate');
  check('an absent key is detected before the journal is written',
    iNull > 0 && iNull < iJournal);
  check('an absent key is detected before any write', iNull > 0 && iNull < iMutate);
  check('an absent key returns key_not_present and stops',
    /if \(current == null\) \{[\s\S]{0,200}outcome = "key_not_present"[\s\S]{0,40}return/.test(t));
}

// ── 8. No value and no exception text crosses the bridge ──────────────────
{
  for (const [name, fn] of [['round trip', TRIP], ['recovery', RECOVER]]) {
    const resolves = (fn || '').match(/promise\.resolve\(([^)]*)\)/g) || [];
    const vocab = name === 'round trip' ? COARSE
      : ['no_pending_rollback', 'pending_rollback_restored',
         'pending_rollback_restore_failed', 'permission_missing', 'error'];
    check(`${name}: every resolve is a coarse status, never a value`,
      resolves.length > 0 &&
      resolves.every((r) => vocab.some((c) => r.includes(`"${c}"`)) || /outcome \?: "error"/.test(r)),
      resolves.join(' | '));
    check(`${name}: logs nothing at all`, (fn || '').length > 0 && !/Log\.|println/.test(fn));
    check(`${name}: no exception text is ever resolved`,
      !/promise\.resolve\([^)]*(e\.message|e\.toString|\$\{e)/.test(fn || ''));
  }
  check('the presence query resolves a bare boolean, never a key or value',
    /promise\.resolve\(rollbackFile\.exists\(\) \|\| restorationFailed\)/.test(PENDING || ''));
  check('the screen renders no value',
    !/\{value\}|\{current\}|\{original\}|\{alternate\}/.test(dev));
  check('the screen discards bridge exception text',
    !/catch\s*\(\s*\w+\s*\)/.test(dev) && /catch \{[\s\S]{0,600}'error'/.test(dev));
}

// ── 9. No normal path can invoke any of this ──────────────────────────────
{
  const CALLERS = [
    'App.tsx', 'src/services/profileBuilder.ts', 'src/services/quickCheck.ts',
    'src/services/profileIO.ts', 'src/services/profileCompare.ts',
    'src/screens/RestoreScreen.tsx', 'src/screens/ScanScreen.tsx',
    'src/screens/HomeScreen.tsx', 'src/screens/CompareScreen.tsx',
    'src/screens/BrowseScreen.tsx', 'src/components/GuidedWizard.tsx',
  ];
  const offenders = CALLERS.filter((p) =>
    /diagnosticRoundTrip\s*\(|diagnosticRecoverPendingRollback\s*\(/.test(read(p)));
  check('no scan/restore/startup/background path calls the round trip',
    offenders.length === 0, offenders.join(','));
  check('the dev screen is the only caller', /diagnosticRoundTrip\(/.test(dev));
}

// ── 10. EXECUTABLE: the journal survives a crash at every step ────────────
//
// A model, not the Kotlin. It runs the specified sequence with process death
// injected before each step and asserts the invariant that matters: after
// recovery, the setting equals the original and no journal remains.
{
  const ORIGINAL = 'ORIG', ALTERNATE = 'ALT';

  /** One run, dying after `dieAfter` steps. Returns the surviving world. */
  function run(world, dieAfter) {
    let step = 0;
    const tick = () => { step += 1; if (step > dieAfter) throw new Error('process death'); };
    try {
      tick(); if (world.journal) return world;               // 1 refuse if pending
      tick(); const current = world.setting;                  // 2 read
      tick(); if (current === null) return world;             // 3 absent -> stop
      tick(); world.journal = { original: current, state: 'pending' }; // 4 journal+fsync
      tick(); world.setting = ALTERNATE;                      // 5 mutate
      tick(); void (world.setting === ALTERNATE);             // 6 fresh read verify
      tick(); world.setting = world.journal.original;         // 7 restore (finally)
      tick(); if (world.setting !== world.journal.original) return world; // 8 verify
      tick(); world.journal.state = 'verified';               // 9
      tick(); world.journal = null;                           // 10 clear
    } catch {
      // process death: `world` keeps whatever was already durable
    }
    return world;
  }

  /** Startup recovery, as specified. */
  function recover(world) {
    if (!world.journal) return world;
    if (world.journal.state === 'verified') { world.journal = null; return world; }
    world.setting = world.journal.original;
    if (world.setting === world.journal.original) world.journal = null;
    return world;
  }

  let allSafe = true, firstBad = null;
  for (let dieAfter = 0; dieAfter <= 12; dieAfter++) {
    const world = recover(run({ setting: ORIGINAL, journal: null }, dieAfter));
    const ok = world.setting === ORIGINAL && world.journal === null;
    if (!ok && firstBad === null) { allSafe = false; firstBad = dieAfter; }
  }
  check('MODEL: crash at any step leaves the original restored and no journal',
    allSafe, firstBad === null ? undefined : `first unsafe crash point: step ${firstBad}`);

  // The dangerous inversion: journalling AFTER the mutation strands the value.
  function runInverted(world, dieAfter) {
    let step = 0;
    const tick = () => { step += 1; if (step > dieAfter) throw new Error('process death'); };
    try {
      tick(); world.setting = ALTERNATE;
      tick(); world.journal = { original: ORIGINAL, state: 'pending' };
      tick(); world.setting = world.journal.original;
      tick(); world.journal = null;
    } catch { /* death */ }
    return world;
  }
  const stranded = recover(runInverted({ setting: ORIGINAL, journal: null }, 1));
  check('MODEL: journalling AFTER the mutation would strand the setting',
    stranded.setting === ALTERNATE && stranded.journal === null);

  // And the Kotlin implements the safe order, not the inverted one.
  const t = TRIP || '';
  check('the Kotlin implements the safe order the model requires',
    t.indexOf('writeJournal(namespace, key, current, "pending")') <
    t.indexOf('writeValue(namespace, key, alternate, resolver)'));
}

// ── 11. App-side half of the cleanup contract ─────────────────────────────
{
  check('a presence-only query exists for cleanup to consult',
    /export async function diagnosticRollbackPending\(\): Promise<boolean>/.test(reader));
  check('the journal is erased by uninstalling the diagnostic package',
    /reactContext\.filesDir/.test(kt));
  console.log('NOTE cleanup-refuses-uninstall is asserted in the experiment ' +
    'bundle suite (Test-BundleSafety.mjs), where the PowerShell script lives.');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
