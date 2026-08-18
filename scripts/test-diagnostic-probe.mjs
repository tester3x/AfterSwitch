/**
 * Diagnostic-probe safety proof.
 *
 * The probe touches real device settings, so it cannot be exercised here.
 * These are structural assertions over the Kotlin and TypeScript sources —
 * weaker than running it, and labelled as such. Their job is to make it hard
 * for a later edit to quietly turn the instrument into a hazard.
 *
 * Run: node scripts/test-diagnostic-probe.mjs
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
  else { fail++; console.log(`FAIL ${name}${detail !== undefined ? ` — ${detail}` : ''}`); }
};

const KT = 'plugins/android/DeviceSettingsModule.kt';
const kt = stripKt(read(KT));
const ktInline = stripKt(read('plugins/withDeviceSettings.js'));
const reader = read('src/services/settingsReader.ts');
const dev = read('src/screens/DevDiagnosticsScreen.tsx');

/** Body of a Kotlin `fun name(` block, brace-matched. */
function ktFun(src, name) {
  const i = src.indexOf(`fun ${name}(`);
  if (i < 0) return null;
  const open = src.indexOf('{', i);
  let d = 0, j = open;
  for (; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') { d--; if (d === 0) break; }
  }
  return src.slice(open, j + 1);
}

// ── 1-2. The permission check no longer mutates ─────────────────────────
{
  const fn = ktFun(kt, 'canWriteSecureSettings');
  check('permission check exists', fn !== null);
  check('permission check performs NO Settings write',
    fn !== null && !/putString|putInt|putFloat|putLong/.test(fn), fn?.match(/put\w+/g)?.join(','));
  check('permission check uses checkSelfPermission',
    fn !== null && /checkSelfPermission/.test(fn) && /WRITE_SECURE_SETTINGS/.test(fn));
  // Assert on the STRIPPED source: a comment explaining why the old probe was
  // wrong is documentation worth keeping. What must not survive is CODE that
  // creates the key.
  check('no code creates afterswitch_permission_test (authoritative Kotlin)',
    !kt.includes('afterswitch_permission_test'));
  check('no code creates afterswitch_permission_test (inline fallback)',
    !ktInline.includes('afterswitch_permission_test'));
  check('the inline fallback also uses checkSelfPermission (no divergence)',
    /checkSelfPermission/.test(ktInline));
}

// ── 3-6. The probe is constrained ───────────────────────────────────────
{
  const fn = ktFun(kt, 'diagnosticSameValueWrite');
  check('diagnostic probe exists', fn !== null);

  check('only secure and global namespaces are accepted',
    fn !== null && /"secure" ->/.test(fn) && /"global" ->/.test(fn) && /else -> \{/.test(fn));

  check('an allowlist gate refuses arbitrary keys',
    fn !== null && /!allowed\.contains\(key\)/.test(fn));

  check('the allowlists are hardcoded sets, not parameters',
    /private val DIAGNOSTIC_SECURE_KEYS = setOf\(/.test(kt) &&
    /private val DIAGNOSTIC_GLOBAL_KEYS = setOf\(/.test(kt));

  check('an absent key is refused before any write',
    fn !== null &&
    fn.indexOf('current == null') >= 0 &&
    fn.indexOf('current == null') < fn.search(/putString/));

  // The ONLY value ever written must be the one just read.
  const writes = (fn || '').match(/putString\([^)]*\)/g) || [];
  check('every write passes the value just read (never a literal or parameter)',
    writes.length > 0 && writes.every((w) => /,\s*key,\s*current\s*\)/.test(w)),
    writes.join(' | '));

  check('permission is re-checked inside the probe',
    fn !== null && /checkSelfPermission/.test(fn));
  check('no automatic retry',
    fn !== null && !/for \(|while \(|retry/i.test(fn));
}

// ── 7. No raw value escapes ─────────────────────────────────────────────
{
  const fn = ktFun(kt, 'diagnosticSameValueWrite');
  const resolves = (fn || '').match(/promise\.resolve\(([^)]*)\)/g) || [];
  const COARSE = ['permission_missing', 'key_not_present', 'same_value_write_succeeded',
                  'security_exception', 'system_overrode', 'error'];
  check('every resolve returns a coarse status string, never a value',
    resolves.length > 0 &&
    resolves.every((r) => COARSE.some((c) => r.includes(`"${c}"`))),
    resolves.join(' | '));
  check('the probe logs nothing at all',
    fn !== null && !/Log\.|println|console/.test(fn));
  check('the dev screen never renders the value',
    !/\{value\}|current\}/.test(dev));
}

// ── 8. No normal path can invoke it ─────────────────────────────────────
{
  const CALLERS = [
    'App.tsx', 'src/services/profileBuilder.ts', 'src/services/quickCheck.ts',
    'src/services/profileIO.ts', 'src/services/profileCompare.ts',
    'src/screens/RestoreScreen.tsx', 'src/screens/ScanScreen.tsx',
    'src/screens/HomeScreen.tsx', 'src/screens/CompareScreen.tsx',
    'src/screens/BrowseScreen.tsx', 'src/components/GuidedWizard.tsx',
  ];
  const offenders = CALLERS.filter((p) => /diagnosticSameValueWrite\s*\(/.test(read(p)));
  check('no scan/restore/startup/background path calls the probe',
    offenders.length === 0, offenders.join(','));

  // Its only caller is the dev screen.
  check('the dev screen is the only caller',
    /diagnosticSameValueWrite\(/.test(dev));
}

// ── 9-10. Development-only, and single-flight ───────────────────────────
{
  // Isolation is structural, not flag-based: an EAS internal APK is a
  // release bundle where __DEV__ is false, so a __DEV__ gate would render
  // nothing. The separate package and entry point are what keep this out.
  // strip() removes comments, so a __DEV__ mention in the explanatory header
  // is fine — what must not exist is a __DEV__ gate in executable code.
  check('the screen does NOT gate on __DEV__ (it must render in the EAS APK)',
    !stripKt(dev).includes('__DEV__'));
  check('the exported wrapper is hook-free and delegates to the live child',
    /export function DevDiagnosticsScreen\(\)\s*\{\s*return <DevDiagnosticsLive \/>;\s*\}/
      .test(stripKt(dev)));
  check('secure and global require separate deliberate taps',
    /\(\['secure', 'global'\] as DiagnosticNamespace\[\]\)\.map/.test(dev));
  check('the permission state is shown before the probe is enabled',
    /CAPABILITY_TEXT\[capability\]/.test(dev) && /const ready = capability === 'granted_untested'/.test(dev));
  check('buttons are disabled until the permission is held',
    /disabled=\{!ready \|\| running !== null\}/.test(dev));
  check('a synchronous latch blocks concurrent runs',
    /const inFlight = useRef\(false\)/.test(dev) && /if \(inFlight\.current\) return;/.test(dev));
  check('the UI states that the existing value is written back unchanged',
    /Writes the existing value back unchanged/.test(dev));
}

// ── 11. The JS bridge refuses off-allowlist keys too ────────────────────
{
  check('the JS wrapper enforces the same allowlist',
    /if \(!allowed\.includes\(key\)\) return 'error';/.test(reader));
  check('the capability tri-state exists and is distinct from permission',
    /'unavailable' \| 'not_granted' \| 'granted_untested'/.test(reader));
  check('canWriteSecureSettings is documented as permission-only',
    /Not whether a restore will work/.test(reader));
}

// ── 12. Architecture preserved until the result is known ────────────────
{
  check('companionBridge.ts still exists', read('src/services/companionBridge.ts').length > 0);
  check('usesCleartextTraffic is still present', /"usesCleartextTraffic": true/.test(read('app.json')));
  check('Restore All routing is unchanged (companion still tried first)',
    /if \(companion\.available && allToRestore\.length > 0\)/.test(read('src/screens/RestoreScreen.tsx')));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
