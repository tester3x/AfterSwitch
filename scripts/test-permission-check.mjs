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

// The capability check must never write.
// The inline Kotlin fallback was REMOVED: plugins/android is now the single
// source, and the config plugin throws if it is absent. Asserting parity
// between two hand-maintained copies is no longer the right property --
// asserting that the second copy cannot exist is stronger.
check('no inline Kotlin fallback exists to drift from the canonical source',
  !/DEVICE_SETTINGS_MODULE_KT|DEVICE_SETTINGS_PACKAGE_KT/.test(INLINE));
check('the config plugin fails hard when the canonical source is missing',
  INLINE.includes('missingSrc.length > 0') && INLINE.includes('throw new Error('));

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
check('companion routing unchanged',
  /if \(companion\.available && allToRestore\.length > 0\)/.test(RESTORE));
check('companionBridge.ts still present', read('src/services/companionBridge.ts').length > 0);
check('usesCleartextTraffic still present', /"usesCleartextTraffic": true/.test(read('app.json')));

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
