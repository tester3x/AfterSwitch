/**
 * The restore planner — the single decision point before any write.
 *
 * Pure and side-effect free on purpose. Every rule that decides whether a
 * setting gets written lives here and is exercised for real by
 * `scripts/test-bounded-restore.mjs`, including a hostile-profile matrix
 * that must produce an empty write list.
 *
 * The screen no longer decides anything: it renders `plan.writes`, calls the
 * native writer for each, and renders the outcomes. Before this module, the
 * decision was spread across `getSettingMeta`'s fallback, a `secureAutoDiffs`
 * promotion in the screen, and a per-namespace `canWrite` filter — three
 * places, none of which was an allowlist.
 */

import type { SettingDiff } from '../types/profile';
import {
  lookupSpec,
  validateForWrite,
  type RestoreNamespace,
} from '../data/restoreAllowlist';

/** Why a difference will not be written. Never carries the value. */
export type ExclusionReason =
  | 'not_allowlisted'
  | 'not_automatic'
  | 'missing_value'
  | 'unsupported_value'
  | 'permission_missing';

export type PlannedWrite = {
  /** Original diff key, `ns.key`, so outcomes map back to the row. */
  diffKey: string;
  namespace: RestoreNamespace;
  key: string;
  /** The RAW source value, validated. Never a formatted display string. */
  value: string;
};

export type PlannedExclusion = {
  diffKey: string;
  key: string;
  reason: ExclusionReason;
};

export type RestorePlan = {
  writes: PlannedWrite[];
  excluded: PlannedExclusion[];
};

/** Which namespaces this build may currently write, from live permission state. */
export type WriteCapability = {
  system: boolean;
  secure: boolean;
  global: boolean;
};

function splitKey(fullKey: string): { ns: string; key: string } | null {
  const cut = fullKey.indexOf('.');
  if (cut <= 0 || cut === fullKey.length - 1) return null;
  return { ns: fullKey.slice(0, cut), key: fullKey.slice(cut + 1) };
}

/**
 * Turn a comparison into an exact write list.
 *
 * Order matters, and each step is a hard stop:
 *   1. the key splits into a namespace and a key
 *   2. the namespace is one this app can address at all
 *   3. the namespace/key pair is allowlisted, exactly
 *   4. the entry's tier is 'auto'
 *   5. the permission for that namespace is currently held
 *   6. the RAW source value validates for type, domain and length
 *
 * A difference that fails any step is reported in `excluded`, never silently
 * dropped, so the summary can tell the user what was not attempted and why.
 */
export function planRestore(
  diffs: readonly SettingDiff[],
  capability: WriteCapability,
): RestorePlan {
  const writes: PlannedWrite[] = [];
  const excluded: PlannedExclusion[] = [];

  for (const diff of diffs) {
    const split = splitKey(diff.key);
    if (!split) {
      excluded.push({ diffKey: diff.key, key: diff.key, reason: 'not_allowlisted' });
      continue;
    }
    const { ns, key } = split;

    // 'defaults' and 'samsung' are captured and displayed, never written.
    if (ns !== 'system' && ns !== 'secure' && ns !== 'global') {
      excluded.push({ diffKey: diff.key, key: diff.key, reason: 'not_allowlisted' });
      continue;
    }

    const spec = lookupSpec(ns, key);
    if (!spec) {
      excluded.push({ diffKey: diff.key, key: diff.key, reason: 'not_allowlisted' });
      continue;
    }
    if (spec.tier !== 'auto') {
      excluded.push({ diffKey: diff.key, key: diff.key, reason: 'not_automatic' });
      continue;
    }
    if (!capability[ns]) {
      excluded.push({ diffKey: diff.key, key: diff.key, reason: 'permission_missing' });
      continue;
    }

    // The RAW source value only. `rawOldValue` is null when the imported
    // profile had no row, and null must never become a write.
    const validated = validateForWrite(ns, key, diff.rawOldValue);
    if (!validated.ok) {
      excluded.push({
        diffKey: diff.key,
        key: diff.key,
        reason: validated.reason === 'missing_value' ? 'missing_value' : 'unsupported_value',
      });
      continue;
    }

    writes.push({ diffKey: diff.key, namespace: ns, key, value: validated.value });
  }

  return { writes: orderWrites(writes), excluded };
}

/**
 * Keys whose write is a CONFIGURATION CHANGE. Android destroys and recreates
 * the foreground activity when one lands, which unmounts the restore screen
 * mid-run: the remaining writes still execute natively, but every status
 * update after that point is a setState on an unmounted component and is
 * silently dropped. The user would watch the progress list go blank.
 *
 * This became a live concern the moment system.font_scale was promoted to
 * auto — it was harmless while the key was guided, because the app never
 * wrote it.
 */
const RECREATES_ACTIVITY: readonly string[] = ['system.font_scale'];

/**
 * Emit activity-recreating writes LAST, preserving relative order otherwise.
 *
 * This does not prevent the recreation; nothing can, short of not writing the
 * key. It bounds the damage to the tail of the run, so at most the final
 * write's own status is lost instead of every status after it.
 */
function orderWrites(writes: PlannedWrite[]): PlannedWrite[] {
  const normal = writes.filter((w) => !RECREATES_ACTIVITY.includes(`${w.namespace}.${w.key}`));
  const last = writes.filter((w) => RECREATES_ACTIVITY.includes(`${w.namespace}.${w.key}`));
  return [...normal, ...last];
}

/** Count of differences this build would attempt, for the confirmation dialog. */
export function plannedWriteCount(
  diffs: readonly SettingDiff[],
  capability: WriteCapability,
): number {
  return planRestore(diffs, capability).writes.length;
}
