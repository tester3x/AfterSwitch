/**
 * EAS native-source parity guard.
 *
 * These assertions exist because commit 18130fdd built an APK that was
 * missing a native method the JS bridge calls. The build succeeded, every
 * static check passed, and the defect only appeared as a button that did
 * nothing on a real phone.
 *
 * Cause: `.gitignore` carried an unanchored `android/` rule, which also
 * matched `plugins/android/`. EAS honours ignore rules when building the
 * upload archive, so the canonical Kotlin never reached the build server.
 * The config plugin then silently fell back to a hand-maintained inline
 * Kotlin string that lacked the method.
 *
 * Every check here would have failed that commit.
 *
 * Run: node scripts/test-eas-native-parity.mjs
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
const PLUGIN  = 'plugins/withDeviceSettings.js';
const kt      = read(KT_PATH);
const ktCode  = strip(kt);
const plugin  = strip(read(PLUGIN));

const SIX_KEYS = [
  'long_press_timeout', 'show_ime_with_hard_keyboard', 'spell_checker_enabled',
  'window_animation_scale', 'transition_animation_scale', 'animator_duration_scale',
];
const COARSE = [
  'permission_missing', 'key_not_present', 'same_value_write_succeeded',
  'security_exception', 'system_overrode', 'error',
];

// ── 1. The archive must actually contain the canonical source ──────────────
// This is the check that would have caught 18130fdd.
{
  let ignored = true;
  try { git('check-ignore', '-q', KT_PATH); } catch { ignored = false; }
  check('canonical Kotlin is NOT excluded by ignore rules', !ignored,
    ignored ? `${KT_PATH} is ignored -- EAS will not upload it` : undefined);

  // The generated native dirs must still be ignored, and only at the root.
  const gi = read('.gitignore');
  check('.gitignore anchors the generated android dir to the root',
    /^\/android\/$/m.test(gi) && !/^android\/$/m.test(gi), 'an unanchored android/ also matches plugins/android/');
  check('.gitignore anchors the generated ios dir to the root',
    /^\/ios\/$/m.test(gi) && !/^ios\/$/m.test(gi));

  let rootIgnored = false;
  try { git('check-ignore', '-q', 'android/app/build.gradle'); rootIgnored = true; } catch { /* not ignored */ }
  check('generated root android/ is still ignored', rootIgnored);

  check('canonical Kotlin is tracked by git', git('ls-files', KT_PATH) === KT_PATH);
}

// ── 2. Single source of truth: no silent fallback ──────────────────────────
{
  check('the plugin has NO inline Kotlin fallback constants',
    !/DEVICE_SETTINGS_MODULE_KT|DEVICE_SETTINGS_PACKAGE_KT/.test(plugin));
  check('the plugin THROWS when the canonical source is missing',
    /missingSrc\.length > 0/.test(plugin) && /throw new Error\(/.test(plugin));
  check('the plugin never writes Kotlin from a string literal',
    !/writeFileSync\([^)]*DeviceSettings\w*\.kt[^)]*,\s*[A-Z_]{4,}/.test(plugin));
  check('the plugin copies from plugins/android only',
    /copyFileSync\(moduleSrc/.test(plugin) && /copyFileSync\(packageSrc/.test(plugin));
}

// ── 3. The canonical source really contains the probe ──────────────────────
{
  check('canonical Kotlin declares diagnosticSameValueWrite',
    /fun diagnosticSameValueWrite\(/.test(ktCode));
  for (const k of SIX_KEYS) {
    check(`canonical Kotlin allowlists ${k}`, ktCode.includes(`"${k}"`));
  }
  for (const c of COARSE) {
    check(`canonical Kotlin can return ${c}`, ktCode.includes(`"${c}"`));
  }
  check('canonical Kotlin allowlists exactly six keys',
    (ktCode.match(/"(long_press_timeout|show_ime_with_hard_keyboard|spell_checker_enabled|window_animation_scale|transition_animation_scale|animator_duration_scale)"/g) || []).length === 6);
}

// ── 4. JS bridge and native allowlists agree ───────────────────────────────
{
  const reader = read('src/services/settingsReader.ts');
  for (const k of SIX_KEYS) check(`JS allowlist contains ${k}`, reader.includes(`'${k}'`));
  const jsKeys = (reader.match(/'(long_press_timeout|show_ime_with_hard_keyboard|spell_checker_enabled|window_animation_scale|transition_animation_scale|animator_duration_scale)'/g) || []);
  check('JS allowlist contains exactly six keys', jsKeys.length === 6, String(jsKeys.length));
  check('the JS bridge calls the method the native module declares',
    /DeviceSettings\.diagnosticSameValueWrite\(/.test(reader) &&
    /fun diagnosticSameValueWrite\(/.test(ktCode));
}

// ── 5. No value can escape, and failure is visible ─────────────────────────
{
  const fnStart = ktCode.indexOf('fun diagnosticSameValueWrite(');
  const fn = fnStart >= 0 ? ktCode.slice(fnStart, ktCode.indexOf('@ReactMethod', fnStart + 10)) : '';
  const resolves = fn.match(/promise\.resolve\(([^)]*)\)/g) || [];
  check('every native resolve returns a coarse status, never a value',
    resolves.length > 0 && resolves.every((r) => COARSE.some((c) => r.includes(`"${c}"`))),
    resolves.join(' | '));
  check('the native probe logs nothing', fn.length > 0 && !/Log\.|println/.test(fn));

  const dev = strip(read('src/screens/DevDiagnosticsScreen.tsx'));
  check('runProbe has a catch so a bridge failure renders a result',
    /catch\s*\{[\s\S]*?\[id\]: 'error'/.test(dev));
  check('the catch discards the exception text',
    !/catch\s*\(\s*\w+\s*\)\s*\{[\s\S]{0,200}(String\(|\.message|\$\{e)/.test(dev));
  check('the button is released in a finally on both paths',
    /finally\s*\{[\s\S]*?setRunning\(null\)[\s\S]*?inFlight\.current = false/.test(dev));
  check('no setting value is rendered', !/\{value\}|\{current\}/.test(dev));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
