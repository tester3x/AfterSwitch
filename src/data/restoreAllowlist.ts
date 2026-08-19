/**
 * The restore allowlist — the ONLY thing that may make a setting writable.
 *
 * WHY THIS EXISTS
 *
 * Before this module, write eligibility came from `getSettingMeta`, whose
 * FALLBACK branch returned `restoreType: 'auto'` for any unrecognised
 * `system.*` key and `'guided'` for any `secure.*`/`global.*` key matching
 * one of 47 substrings — `lock`, `password`, `biometric`, `accessibility`,
 * `wifi`, `ime` among them. `RestoreScreen` then promoted every non-defaults
 * guided diff to an automatic write as soon as WRITE_SECURE_SETTINGS was
 * held. A key's ABSENCE from the registry made it more permissive, not less.
 *
 * That is inverted here. A namespace/key pair that is not listed below is
 * not writable, in any tier, by any path. There are no wildcards, no
 * prefixes, no substring matching and no fallback.
 *
 * TIERS
 *   'auto'         may be written without the user visiting Settings
 *   'guided'       shown with instructions; NEVER written by this app
 *   'unsupported'  displayed read-only; never written and never guided
 *
 * EVIDENCE
 *   'round_trip_proven'  a changed value was written, verified by a fresh
 *                        read, restored to the exact original, and the
 *                        restoration verified — on a real device
 *   'same_value_only'    a same-value write was accepted; this does NOT
 *                        establish that a CHANGED value will be
 *   'absent'             no row existed on the tested device; inconclusive
 *   'unproven'           no device evidence at all
 *
 * The tier/evidence pairing is enforced by test, not by convention: an
 * 'auto' entry must be 'round_trip_proven'. A key that merely looks benign
 * does not qualify — the S24 run proved two keys, and only those two are
 * automatic today.
 */

export type RestoreNamespace = 'system' | 'secure' | 'global';
export type RestoreTier = 'auto' | 'guided' | 'unsupported';
export type EvidenceLevel =
  | 'round_trip_proven'
  | 'same_value_only'
  | 'absent'
  | 'unproven';

/**
 * Why a value was refused. Never carries the value itself, so a refusal can
 * be logged or displayed without leaking a setting.
 */
export type ValueRejection =
  | 'not_allowlisted'
  | 'not_writable_tier'
  | 'missing_value'
  | 'wrong_type'
  | 'out_of_domain'
  | 'too_long';

export type ValidationResult =
  | { ok: true; value: string }
  | { ok: false; reason: ValueRejection };

type Domain =
  | { kind: 'int'; min: number; max: number }
  | { kind: 'float'; min: number; max: number }
  | { kind: 'enum'; values: readonly string[] }
  | { kind: 'component' };

export type RestoreSpec = {
  namespace: RestoreNamespace;
  /** Exact key. Never a pattern — the tests reject anything but [a-z0-9_.]. */
  key: string;
  tier: RestoreTier;
  domain: Domain;
  evidence: EvidenceLevel;
  /** Why this tier, in one line. Read by a human deciding whether to promote. */
  rationale: string;
};

/**
 * No value we write is longer than this. Real settings values are short;
 * a long one means a corrupted or hostile profile, not a preference.
 */
export const MAX_VALUE_LENGTH = 256;

/**
 * Categories that may never be automatic, whatever the evidence says.
 * Listed here so the reason travels with the entry rather than living only
 * in a test.
 */
const DANGEROUS_RATIONALE = {
  input: 'Input method. A wrong value can leave the user with no keyboard.',
  navigation: 'Navigation mode. A wrong value can leave no way to go back.',
  a11y: 'Accessibility services. Writing this can disable the assistive service someone depends on, or name a service that is not installed.',
  security: 'Security-relevant. Changing this weakens the device posture.',
  radio: 'Radio state. Not a preference, and not restorable by a settings write.',
} as const;

export const ALL_SPECS: readonly RestoreSpec[] = [
  // ── auto: device-proven, changed-value round trip, S24 / Android 16 ──────
  {
    namespace: 'secure',
    key: 'long_press_timeout',
    tier: 'auto',
    domain: { kind: 'int', min: 100, max: 5000 },
    evidence: 'round_trip_proven',
    rationale: 'Touch-and-hold delay. Cosmetic, instantly reversible. Changed, verified, restored and re-verified on device.',
  },
  {
    namespace: 'global',
    key: 'window_animation_scale',
    tier: 'auto',
    domain: { kind: 'float', min: 0, max: 10 },
    evidence: 'round_trip_proven',
    rationale: 'Animation speed multiplier. Cosmetic, instantly reversible. Changed, verified, restored and re-verified on device.',
  },

  // ── guided: evidence pending. Same-value success is NOT enough. ──────────
  {
    namespace: 'secure',
    key: 'show_ime_with_hard_keyboard',
    tier: 'guided',
    domain: { kind: 'enum', values: ['0', '1'] },
    evidence: 'same_value_only',
    rationale: 'A same-value write was accepted, which a provider may do trivially for a no-op. Needs a changed-value round trip before promotion.',
  },
  {
    namespace: 'global',
    key: 'transition_animation_scale',
    tier: 'guided',
    domain: { kind: 'float', min: 0, max: 10 },
    evidence: 'same_value_only',
    rationale: 'Same-value only. Needs a changed-value round trip before promotion.',
  },
  {
    namespace: 'secure',
    key: 'spell_checker_enabled',
    tier: 'guided',
    domain: { kind: 'enum', values: ['0', '1'] },
    evidence: 'absent',
    rationale: 'No row existed on the tested device. Absence is not proof the setting is unsupported, and not proof it is writable.',
  },
  {
    namespace: 'global',
    key: 'animator_duration_scale',
    tier: 'guided',
    domain: { kind: 'float', min: 0, max: 10 },
    evidence: 'absent',
    rationale: 'No row existed on the tested device. Inconclusive either way.',
  },

  // ── guided: System namespace. ZERO device evidence exists for any of it. ─
  // These use WRITE_SETTINGS, a DIFFERENT permission from the one proven, so
  // the S24 result says nothing about them. Benign appearance is not proof.
  {
    namespace: 'system',
    key: 'screen_off_timeout',
    tier: 'guided',
    domain: { kind: 'int', min: 15000, max: 1800000 },
    evidence: 'unproven',
    rationale: 'WRITE_SETTINGS path is untested. No device evidence.',
  },
  {
    namespace: 'system',
    key: 'font_scale',
    tier: 'guided',
    domain: { kind: 'float', min: 0.5, max: 2 },
    evidence: 'unproven',
    rationale: 'WRITE_SETTINGS path is untested. No device evidence.',
  },
  {
    namespace: 'system',
    key: 'accelerometer_rotation',
    tier: 'guided',
    domain: { kind: 'enum', values: ['0', '1'] },
    evidence: 'unproven',
    rationale: 'WRITE_SETTINGS path is untested. No device evidence.',
  },
  {
    namespace: 'system',
    key: 'screen_brightness_mode',
    tier: 'guided',
    domain: { kind: 'enum', values: ['0', '1'] },
    evidence: 'unproven',
    rationale: 'WRITE_SETTINGS path is untested. No device evidence.',
  },
  {
    namespace: 'system',
    key: 'haptic_feedback_enabled',
    tier: 'guided',
    domain: { kind: 'enum', values: ['0', '1'] },
    evidence: 'unproven',
    rationale: 'WRITE_SETTINGS path is untested. No device evidence.',
  },
  {
    namespace: 'system',
    key: 'sound_effects_enabled',
    tier: 'guided',
    domain: { kind: 'enum', values: ['0', '1'] },
    evidence: 'unproven',
    rationale: 'WRITE_SETTINGS path is untested. No device evidence.',
  },
  {
    namespace: 'system',
    key: 'volume_ring',
    tier: 'guided',
    domain: { kind: 'int', min: 0, max: 30 },
    evidence: 'unproven',
    rationale: 'Volume indices are stream- and device-specific; the same number means different loudness on different hardware.',
  },
  {
    namespace: 'system',
    key: 'volume_notification',
    tier: 'guided',
    domain: { kind: 'int', min: 0, max: 30 },
    evidence: 'unproven',
    rationale: 'Volume indices are stream- and device-specific.',
  },
  {
    namespace: 'system',
    key: 'volume_alarm',
    tier: 'guided',
    domain: { kind: 'int', min: 0, max: 30 },
    evidence: 'unproven',
    rationale: 'Volume indices are stream- and device-specific.',
  },
  {
    namespace: 'system',
    key: 'volume_music',
    tier: 'guided',
    domain: { kind: 'int', min: 0, max: 30 },
    evidence: 'unproven',
    rationale: 'Volume indices are stream- and device-specific.',
  },

  // ── unsupported: dangerous categories. Never automatic, never written. ───
  {
    namespace: 'secure',
    key: 'default_input_method',
    tier: 'unsupported',
    domain: { kind: 'component' },
    evidence: 'unproven',
    rationale: DANGEROUS_RATIONALE.input,
  },
  {
    namespace: 'secure',
    key: 'navigation_mode',
    tier: 'unsupported',
    domain: { kind: 'enum', values: ['0', '1', '2'] },
    evidence: 'unproven',
    rationale: DANGEROUS_RATIONALE.navigation,
  },
  {
    namespace: 'secure',
    key: 'enabled_accessibility_services',
    tier: 'unsupported',
    domain: { kind: 'component' },
    evidence: 'unproven',
    rationale: DANGEROUS_RATIONALE.a11y,
  },
  {
    namespace: 'global',
    key: 'adb_enabled',
    tier: 'unsupported',
    domain: { kind: 'enum', values: ['0', '1'] },
    evidence: 'unproven',
    rationale: DANGEROUS_RATIONALE.security,
  },
  {
    namespace: 'global',
    key: 'stay_on_while_plugged_in',
    tier: 'unsupported',
    domain: { kind: 'int', min: 0, max: 7 },
    evidence: 'unproven',
    rationale: DANGEROUS_RATIONALE.security,
  },
  {
    namespace: 'global',
    key: 'wifi_on',
    tier: 'unsupported',
    domain: { kind: 'enum', values: ['0', '1'] },
    evidence: 'unproven',
    rationale: DANGEROUS_RATIONALE.radio,
  },
  {
    namespace: 'global',
    key: 'bluetooth_on',
    tier: 'unsupported',
    domain: { kind: 'enum', values: ['0', '1'] },
    evidence: 'unproven',
    rationale: DANGEROUS_RATIONALE.radio,
  },
  {
    namespace: 'global',
    key: 'auto_time',
    tier: 'unsupported',
    domain: { kind: 'enum', values: ['0', '1'] },
    evidence: 'unproven',
    rationale: 'Listed for completeness. It is also unreachable: profileCompare drops it via IGNORED_SETTING_PATTERNS /_time$/ before any lookup happens.',
  },
];

/** Exact index. Namespace and key are matched independently and in full. */
const INDEX: Map<string, RestoreSpec> = new Map(
  ALL_SPECS.map((s) => [`${s.namespace} ${s.key}`, s]),
);

/**
 * The single lookup. Returns null for anything not listed — which is the
 * common case and the safe one.
 */
export function lookupSpec(namespace: string, key: string): RestoreSpec | null {
  return INDEX.get(`${namespace} ${key}`) ?? null;
}

/** Convenience for the compare stage, which speaks in `ns.key` strings. */
export function lookupSpecByFullKey(fullKey: string): RestoreSpec | null {
  const cut = fullKey.indexOf('.');
  if (cut <= 0) return null;
  return lookupSpec(fullKey.slice(0, cut), fullKey.slice(cut + 1));
}

function inDomain(domain: Domain, raw: string): boolean {
  switch (domain.kind) {
    case 'int': {
      if (!/^-?\d+$/.test(raw)) return false;
      const n = Number(raw);
      return Number.isSafeInteger(n) && n >= domain.min && n <= domain.max;
    }
    case 'float': {
      // Reject exponent notation and anything non-numeric outright: a real
      // settings float is written plainly, and '1e309' parses to Infinity.
      if (!/^-?\d+(\.\d+)?$/.test(raw)) return false;
      const n = Number(raw);
      return Number.isFinite(n) && n >= domain.min && n <= domain.max;
    }
    case 'enum':
      return domain.values.includes(raw);
    case 'component':
      // Only ever reached by tiers that cannot be written. Kept strict so a
      // future promotion starts from a real check rather than a permissive one.
      return /^[A-Za-z0-9_.]+\/[A-Za-z0-9_.$]+$/.test(raw);
  }
}

/**
 * The gate every write must pass, immediately before the call. Checks, in
 * order: the pair is allowlisted, the tier permits writing, a value is
 * actually present, it is not absurdly long, and it is in domain.
 *
 * A formatted display string — '(not set)', 'ON', 'OFF', an app label — has
 * no chance of surviving this, which is the point: the old code could take a
 * write value straight from the formatted field.
 */
export function validateForWrite(
  namespace: string,
  key: string,
  raw: string | null | undefined,
): ValidationResult {
  const spec = lookupSpec(namespace, key);
  if (!spec) return { ok: false, reason: 'not_allowlisted' };
  if (spec.tier !== 'auto') return { ok: false, reason: 'not_writable_tier' };
  if (raw === null || raw === undefined || raw.trim() === '') {
    return { ok: false, reason: 'missing_value' };
  }
  if (raw.length > MAX_VALUE_LENGTH) return { ok: false, reason: 'too_long' };
  if (!inDomain(spec.domain, raw)) {
    return {
      ok: false,
      reason: spec.domain.kind === 'enum' ? 'out_of_domain' : 'wrong_type',
    };
  }
  return { ok: true, value: raw };
}

/**
 * How a diff should be presented. This is the only source of restorability;
 * `getSettingMeta` supplies labels and formatting and nothing else.
 */
export function tierToRestoreType(spec: RestoreSpec | null): 'auto' | 'guided' | 'info' {
  if (!spec) return 'info';
  if (spec.tier === 'auto') return 'auto';
  if (spec.tier === 'guided') return 'guided';
  return 'info';
}
