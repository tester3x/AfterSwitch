/**
 * PERMANENT test — the secure-settings capability check must not mutate.
 *
 * This outlives the experiment. The temporary diagnostic probe and its
 * dev screen are removed after the device run; this assertion is the part
 * that must keep holding forever.
 *
 * Run: node scripts/test-permission-check.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name}${detail !== undefined ? ` — ${detail}` : ''}`); }
};

const KT = strip(read('plugins/android/DeviceSettingsModule.kt'));
const INLINE = strip(read('plugins/withDeviceSettings.js'));
const READER = read('src/services/settingsReader.ts');

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

// The inline Kotlin fallback has been DELETED. It existed so a build could
// proceed when plugins/android/ was missing from the archive — which is
// exactly what happened, silently, in the 18130fdd build: the plugin compiled
// a stale hand-maintained copy and shipped an APK without a native method the
// bridge calls. The plugin now throws instead of substituting.
//
// So the loop below no longer covers a second copy, and these two assertions
// replace the divergence guard with the stronger property: there is nothing
// left to diverge.
check('no inline Kotlin fallback constant survives',
  !/const DEVICE_SETTINGS_(MODULE|PACKAGE)_KT\s*=/.test(INLINE));
check('the plugin fails the build rather than substituting Kotlin',
  /missingSrc\.length > 0/.test(INLINE) && /throw new Error\(/.test(INLINE));

// The capability check must never write.
for (const [label, src] of [['authoritative Kotlin', KT]]) {
  const fn = ktFun(src, 'canWriteSecureSettings');
  check(`${label}: capability check exists`, fn !== null);
  check(`${label}: capability check performs NO write`,
    fn !== null && !/putString|putInt|putFloat|putLong/.test(fn),
    fn?.match(/put\w+/g)?.join(','));
  check(`${label}: uses checkSelfPermission(WRITE_SECURE_SETTINGS)`,
    fn !== null && /checkSelfPermission/.test(fn) && /WRITE_SECURE_SETTINGS/.test(fn));
  check(`${label}: no afterswitch_permission_test in executable code`,
    !src.includes('afterswitch_permission_test'));
}

// The three capability states must stay distinct.
check('capability tri-state is declared',
  /'unavailable' \| 'not_granted' \| 'granted_untested'/.test(READER));
check('permission-granted is not documented as restore-capable',
  /Not whether a restore will work/.test(READER));

// Normal restore routing must be untouched by this repair.
const RESTORE = read('src/screens/RestoreScreen.tsx');
check('restore still calls canWriteSecureSettings', /canWriteSecureSettings\(\)/.test(RESTORE));
// This used to pin the literal line `if (companion.available &&
// allToRestore.length > 0)`. That was a scope guard for the permission
// repair -- "do not touch routing while fixing the capability check" -- and
// the bounded-restore lane deliberately DID change routing: the companion is
// now a transport for writes the allowlist already approved, and the planner
// decides the list. Pinning a source line meant the assertion failed for the
// intended change, so it now pins the property that must still hold.
check('the companion is still preferred when available',
  /companion\.available/.test(RESTORE) && /writeSettingsViaCompanion\(/.test(RESTORE));
check('the companion cannot widen what is written',
  /planRestore\(/.test(RESTORE) &&
  /const settingsToWrite: SettingToWrite\[\] = plan\.writes\.map/.test(RESTORE));
check('companionBridge.ts still present', read('src/services/companionBridge.ts').length > 0);
check('usesCleartextTraffic still present', /"usesCleartextTraffic": true/.test(read('app.json')));

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
