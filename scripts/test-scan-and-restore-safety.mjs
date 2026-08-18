/**
 * Scan honesty and Restore All confirmation — structural proof.
 *
 * These two properties live in React components and a native-module bridge,
 * neither of which can run without a device. So they are proven by analysing
 * the source: which call sites exist, and in what order the code reaches
 * them. Weaker than driving the real UI, and stated as such.
 *
 * Run: node scripts/test-scan-and-restore-safety.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const strip = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name}${detail !== undefined ? ` — ${detail}` : ''}`); }
};

const builder = read('src/services/profileBuilder.ts');
const restore = read('src/screens/RestoreScreen.tsx');
const app = read('App.tsx');

// ── B. A normal scan can never silently fabricate data ──────────────────
{
  const clean = strip(builder);

  check('buildSampleProfile no longer exists anywhere in src',
    !strip(read('src/services/profileBuilder.ts')).includes('function buildSampleProfile'));

  // The decisive one: no file may call it.
  const callers = ['App.tsx', 'src/services/profileBuilder.ts', 'src/services/quickCheck.ts',
                   'src/screens/HomeScreen.tsx', 'src/screens/ScanScreen.tsx',
                   'src/screens/CompareScreen.tsx', 'src/screens/RestoreScreen.tsx',
                   'src/screens/BrowseScreen.tsx']
    .filter((p) => /buildSampleProfile\s*\(/.test(strip(read(p))));
  check('no file calls buildSampleProfile()', callers.length === 0, callers.join(','));

  check('a missing native module THROWS instead of returning a profile',
    /if \(!isNativeModuleAvailable\(\)\) \{\s*throw new NativeCaptureUnavailableError\(\);/.test(clean));

  check('the refusal is a typed error with a stable code',
    /class NativeCaptureUnavailableError extends Error/.test(clean) &&
    /readonly code = 'native_capture_unavailable'/.test(clean));

  check('the refusal explains a real build is required',
    /native module/i.test(clean) && /Expo Go/.test(clean));

  // Both scan entry points must surface it rather than swallow it.
  const appClean = strip(app);
  const entryPoints = appClean.split('buildProfile(').length - 1;
  check('both scan entry points still exist', entryPoints === 2, String(entryPoints));
  check('both entry points handle NativeCaptureUnavailableError',
    (appClean.match(/NativeCaptureUnavailableError/g) || []).length >= 2);
}

// ── C. Restore All confirmation ────────────────────────────────────────
{
  const clean = strip(restore);

  check('the Restore All button opens the confirmation, not the restore',
    /onPress=\{requestRestoreAll\}/.test(clean) && !/onPress=\{performRestoreAll\}\s*\/>/.test(clean));

  // requestRestoreAll must contain no write and no restore call.
  const req = clean.slice(clean.indexOf('const requestRestoreAll'),
                          clean.indexOf('const performRestoreAll'));
  check('requestRestoreAll performs NO write and starts NO restore',
    req.length > 0 &&
    !/writeSystemSetting|writeSecureSetting|writeGlobalSetting|writeSettingsViaCompanion|handleRestoreSetting/.test(req),
    req.match(/write\w+/g)?.join(','));
  check('requestRestoreAll only opens the dialog',
    /setConfirmVisible\(true\)/.test(req));

  // Confirm is the only route to a write.
  const confirmOnPress = (clean.match(/onPress=\{performRestoreAll\}/g) || []).length;
  check('performRestoreAll has exactly one trigger (the Confirm button)',
    confirmOnPress === 1, String(confirmOnPress));

  // Cancel / back / backdrop must all merely close.
  check('Android back closes without restoring',
    /onRequestClose=\{\(\) => setConfirmVisible\(false\)\}/.test(clean));
  check('backdrop press closes without restoring',
    /styles\.confirmBackdrop\} onPress=\{\(\) => setConfirmVisible\(false\)\}/.test(clean));
  check('an explicit Cancel control exists and only closes',
    /styles\.confirmCancel[\s\S]{0,120}setConfirmVisible\(false\)/.test(clean));

  // Double-start protection: a synchronous latch, not just React state.
  check('a synchronous double-start latch exists',
    /restoreStartedRef = useRef\(false\)/.test(clean));
  const perf = clean.slice(clean.indexOf('const performRestoreAll'));
  const latchAt = perf.indexOf('if (restoreStartedRef.current) return;');
  const firstWrite = perf.search(/writeSettingsViaCompanion|handleRestoreSetting\(/);
  check('the latch is checked BEFORE any write begins',
    latchAt >= 0 && firstWrite >= 0 && latchAt < firstWrite, `latch@${latchAt} write@${firstWrite}`);
  check('the latch is released when the restore finishes',
    /restoreStartedRef\.current = false/.test(perf));
  check('the Confirm button is disabled while restoring',
    /disabled=\{restoring\}/.test(clean));

  // The dialog must state all four required facts.
  check('confirmation states the automatic count', /restorePlan\.automaticCount/.test(clean));
  check('confirmation states the guided/manual count', /restorePlan\.guidedCount/.test(clean));
  check('confirmation states the skipped count', /restorePlan\.skippedCount/.test(clean));
  check('confirmation warns about device/version differences',
    /vary by Android version/i.test(restore));
  check('confirmation warns there is no full automatic undo',
    /no full automatic undo/i.test(restore));
  check('confirmation recommends saving/exporting first',
    /Save or export a profile/i.test(restore));

  // The guided wizard must be untouched.
  check('the guided wizard is still rendered', /GuidedWizard/.test(clean));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
