/**
 * Phase 0 safety inventory — deterministic, dependency-free.
 *
 * Proves by static analysis that no reachable path can send a raw
 * DeviceProfile off the device. Static rather than runtime on purpose: the
 * runtime paths need Firebase and a device, and this must be runnable and
 * meaningful without either.
 *
 * Run: node scripts/verify-privacy-hold.mjs
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
  else { fail++; console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};

const hold = read('src/services/privacyHold.ts');
const shared = read('src/services/sharedProfiles.ts');
const cloud = read('src/services/cloudProfiles.ts');
const app = read('App.tsx');
const browse = read('src/screens/BrowseScreen.tsx');
const modal = read('src/components/ShareProfileModal.tsx');

// ── The gate itself defaults closed ──────────────────────────────────────
for (const flag of [
  'COMMUNITY_SHARING_ENABLED',
  'COMMUNITY_RETRIEVAL_ENABLED',
  'RAW_CLOUD_UPLOAD_ENABLED',
]) {
  // includes(), not RegExp: `\s` inside a template literal collapses to `s`,
  // which silently produces a pattern that can never match.
  check(`${flag} defaults to false`,
    hold.includes(`export const ${flag} = false;`));
}
check('the hold is compile-time, not remotely toggleable',
  !/process\.env|AsyncStorage|getDoc|remoteConfig|fetch\(/.test(strip(hold)));

// ── Refusal precedes serialization and Firestore, per function ───────────
// The assert must appear before the FIRST occurrence of any Firestore call
// or JSON.stringify inside each held function body.
const FIRESTORE = /\b(setDoc|getDoc|getDocs|updateDoc|deleteDoc|addDoc)\s*\(/;
const SERIALIZE = /JSON\.stringify\s*\(/;

function bodyOf(src, fnName) {
  return bodyAfter(src, `export async function ${fnName}(`);
}

/** Body of whatever declaration `decl` names (component, plain fn, async fn). */
function bodyAfter(src, decl) {
  const i = src.indexOf(decl);
  if (i < 0) return null;
  // brace-match from the first '{' that starts the body (after the return type)
  // Walk past the parameter list, then past the return type. A return type
  // such as Promise<{ a: string }> contains a brace that is NOT the body.
  let k = src.indexOf('(', i), pd = 0;
  for (; k < src.length; k++) {
    if (src[k] === '(') pd++;
    else if (src[k] === ')') { pd--; if (pd === 0) break; }
  }
  let ad = 0, arrow = -1;
  for (let m = k; m < src.length; m++) {
    const ch = src[m];
    if (ch === '<') ad++;
    else if (ch === '>') ad--;
    else if (ch === '{' && ad === 0) { arrow = m; break; }
  }
  if (arrow < 0) return null;
  let depth = 0, j = arrow;
  for (; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) break; }
  }
  return src.slice(arrow, j + 1);
}

const HELD = [
  ['sharedProfiles', shared, 'shareProfile', 'assertCommunitySharingAllowed'],
  ['sharedProfiles', shared, 'unshareProfile', 'assertCommunitySharingAllowed'],
  ['sharedProfiles', shared, 'getMySharedProfiles', 'assertCommunityRetrievalAllowed'],
  ['sharedProfiles', shared, 'browseSharedProfiles', 'assertCommunityRetrievalAllowed'],
  ['sharedProfiles', shared, 'getProfileByShareCode', 'assertCommunityRetrievalAllowed'],
  ['sharedProfiles', shared, 'getSharedProfileById', 'assertCommunityRetrievalAllowed'],
  ['cloudProfiles', cloud, 'saveProfileToCloud', 'assertRawCloudUploadAllowed'],
];

for (const [file, src, fn, guard] of HELD) {
  const body = bodyOf(src, fn);
  if (!body) { check(`${file}.${fn} exists`, false); continue; }
  const clean = strip(body);
  const g = clean.indexOf(`${guard}()`);
  const fsIdx = clean.search(FIRESTORE);
  const serIdx = clean.search(SERIALIZE);
  check(`${fn}: guarded by ${guard}`, g >= 0);
  check(`${fn}: refuses BEFORE any Firestore call`,
    g >= 0 && (fsIdx === -1 || g < fsIdx), `guard@${g} firestore@${fsIdx}`);
  check(`${fn}: refuses BEFORE any serialization`,
    g >= 0 && (serIdx === -1 || g < serIdx), `guard@${g} stringify@${serIdx}`);
}

// ── The post-scan auto-upload call site is gone, not merely caught ───────
const appClean = strip(app);
check('no saveProfileToCloud call site remains in App.tsx',
  !/saveProfileToCloud\s*\(/.test(appClean));
check('App.tsx no longer claims a cloud save succeeded',
  !/Saved locally \+ cloud|Saved to cloud/.test(appClean));
check('deep-link community lookup is gated in the UI too',
  /COMMUNITY_RETRIEVAL_ENABLED/.test(appClean) &&
  appClean.indexOf('COMMUNITY_RETRIEVAL_ENABLED') <
  appClean.indexOf('getProfileByShareCode(code)'));

// ── UI surfaces: gate wrapper + enabled child (Rules of Hooks) ───────────
// A conditional early return followed by hooks in the SAME component would
// violate the Rules of Hooks. TypeScript cannot see that, so assert the
// split structurally: the exported wrapper must be hook-free, and every hook
// must live in the enabled child that the hold prevents from mounting.
const HOOK = /\buse[A-Z]\w*\s*\(/g;

const SURFACES = [
  ['BrowseScreen', browse, 'export function BrowseScreen(',
    'function BrowseScreenLive(', 'COMMUNITY_RETRIEVAL_ENABLED', '<BrowseScreenLive'],
  ['ShareProfileModal', modal, 'export function ShareProfileModal(',
    'function ShareProfileModalLive(', 'COMMUNITY_SHARING_ENABLED', '<ShareProfileModalLive'],
];

for (const [name, src, gateDecl, liveDecl, flag, element] of SURFACES) {
  const gate = strip(bodyAfter(src, gateDecl) || '');
  const live = strip(bodyAfter(src, liveDecl) || '');

  check(`${name}: exported gate wrapper contains NO hooks`,
    gate.length > 0 && (gate.match(HOOK) || []).length === 0,
    (gate.match(HOOK) || []).join(','));

  check(`${name}: enabled child exists and holds the hooks`,
    live.length > 0 && (live.match(HOOK) || []).length > 0);

  // The gate must refuse before it can return the enabled child.
  check(`${name}: hold branch precedes rendering the enabled child`,
    gate.includes(`if (!${flag})`) &&
    gate.indexOf(`if (!${flag})`) < gate.indexOf(element));

  // With the flag false the child is unreachable: its only render site is
  // inside the gate, after the hold has already returned.
  check(`${name}: enabled child has exactly one render site, inside the gate`,
    (strip(src).split(element).length - 1) === 1 &&
    gate.includes(element));
}

// ── Preserved behaviour ─────────────────────────────────────────────────
check('local save after a scan is preserved',
  /saveProfileLocally\(profile\)/.test(appClean));
check('local file export is still reachable',
  /exportProfileJson/.test(appClean));
check('local file import is still reachable',
  /importProfileFromUri/.test(appClean));
check('cloud READ paths are untouched (no upload, no mutation)',
  /loadLatestCloudProfile/.test(appClean) &&
  !/setDoc|updateDoc/.test(strip(bodyOf(cloud, 'loadLatestCloudProfile') || '')));
check('native capture, registry, restore and companion bridge untouched',
  ['src/services/settingsReader.ts', 'src/services/profileBuilder.ts',
   'src/services/profileIO.ts', 'src/services/profileCompare.ts',
   'src/services/companionBridge.ts', 'src/data/settingsRegistry.ts',
   'src/screens/RestoreScreen.tsx', 'plugins/withDeviceSettings.js']
    .every((p) => !read(p).includes('privacyHold')));


// ── Firestore rules: shared_profiles must be effective deny-all ──────────
// Structural, not behavioural: the emulator could not start in this
// environment (see report), so this proves the property by analysing every
// match block rather than by exercising the evaluator. Weaker evidence —
// stated as such.
//
// Firestore rules are OR-based: a deny never subtracts from a grant. So the
// test is not "is there an `if false` for shared_profiles" but "does ANY
// match that could cover shared_profiles grant anything".
{
  const rules = read('firestore.rules');
  const clean = strip(rules);

  // Every `match <path> {` and every `allow ...: if <cond>;` in order.
  // Per line: a path such as /shared_profiles/{document=**} contains braces,
  // so stopping at the first '{' truncates the capture.
  const blocks = [...clean.matchAll(/^[ \t]*match[ \t]+(.+?)[ \t]*\{[ \t]*$/gm)]
    .map((m) => ({ path: m[1], at: m.index }));
  const allows = [...clean.matchAll(/allow\s+([a-z,\s]+):\s*if\s+([^;]+);/g)]
    .map((m) => ({ ops: m[1].replace(/\s+/g, ''), cond: m[2].trim(), at: m.index }));

  // Which match owns each allow: the nearest preceding match block.
  const owner = (a) => blocks.filter((b) => b.at < a.at).pop();

  /** Could this match path ever cover a document under /shared_profiles? */
  const coversShared = (p) =>
    p === '/{document=**}' ||
    p.startsWith('/shared_profiles') ||
    p === '/databases/{database}/documents';

  const granting = allows.filter((a) => a.cond !== 'false');
  const dangerous = granting.filter((a) => coversShared(owner(a)?.path || ''));

  check('rules: a shared_profiles deny block exists',
    blocks.some((b) => b.path.startsWith('/shared_profiles')));
  check('rules: the shared_profiles match covers subcollections ({document=**})',
    blocks.some((b) => b.path === '/shared_profiles/{document=**}'));
  check('rules: NO match covering shared_profiles grants anything',
    dangerous.length === 0,
    dangerous.map((d) => `${owner(d)?.path} allow ${d.ops}`).join(' | '));
  check('rules: every allow under shared_profiles is `if false`',
    allows.filter((a) => (owner(a)?.path || '').startsWith('/shared_profiles'))
      .every((a) => a.cond === 'false'));
  check('rules: the unrelated owner grant is untouched',
    granting.some((a) =>
      (owner(a)?.path || '') === '/afterswitch_profiles/{uid}/profiles/{profileId}' &&
      a.cond.includes('request.auth.uid == uid')));
  check('rules: catch-all still denies',
    allows.some((a) => (owner(a)?.path || '') === '/{document=**}' && a.cond === 'false'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
