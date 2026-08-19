/**
 * DEVELOPMENT DIAGNOSTICS — system-write matrix.
 *
 * Establishes, per key, the only result that qualifies it for automatic
 * restore: a CHANGED value written, confirmed by a fresh read, then the exact
 * original put back and confirmed. A same-value write proves nothing here —
 * a provider may accept a no-op trivially — and no result from this screen
 * promotes anything on its own.
 *
 * Twelve changed-value round trips, run strictly one at a time and in order.
 * Two non-mutating probes that never write.
 *
 * ISOLATION IS STRUCTURAL, NOT FLAG-BASED. This deliberately does not gate on
 * a development flag: an EAS internal APK is a release-style bundle where
 * such a flag is false, so the gate would render nothing and the experiment
 * could not run. What keeps it out of the real app is stronger — a separate
 * Android package built from a separate entry point that never imports
 * App.tsx, and a branch that is never merged.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SectionCard } from '../components/SectionCard';
import {
  MATRIX_ORDER,
  MATRIX_PROBES,
  canWriteSecureSettings,
  canWriteSystemSettings,
  matrixNextAllowedIndex,
  matrixProbePresence,
  matrixRecoverPendingRollback,
  matrixRoundTrip,
  type MatrixProbeResult,
  type MatrixRecoveryResult,
  type MatrixRoundTripResult,
} from '../services/settingsReader';

const TRIP_TEXT: Record<MatrixRoundTripResult, string> = {
  round_trip_succeeded:
    'CHANGED the value, confirmed by a fresh read, restored the exact original, confirmed again.',
  key_not_present: 'No row exists for this key on this device. Nothing was written.',
  change_write_failed_original_intact:
    'Android REFUSED the changed-value write. The original was never modified.',
  change_not_persisted_original_restored:
    'The write was accepted but the fresh read disagreed, so it did not persist. The original is back.',
  restore_succeeded_after_test_failure:
    'The test failed partway, but the original was restored and verified.',
  restore_failed_stop_immediately:
    'STOP. The restoration could not be verified. The journal is still pending and will be retried on the next launch. Do not uninstall.',
  permission_missing: 'The permission for this namespace is not held. Nothing was written.',
  unsupported_value:
    'The current value is outside the validated domain, so no safe alternate exists. Nothing was written.',
  out_of_order: 'Run the previous key first. This one is not unlocked yet.',
  error: 'Refused or unusable. Nothing was written.',
};

const PROBE_TEXT: Record<MatrixProbeResult, string> = {
  present_row: 'A row EXISTS for this key. The earlier absent result does not reproduce.',
  absent_key_in_public_sdk:
    'No row, but the platform declares this key in its public Settings class — consistent with a known setting sitting on an implicit default.',
  absent_key_not_in_public_sdk:
    'No row, and no public Settings constant. INCONCLUSIVE: a @hide constant is filtered out of reflection too, so this cannot tell "unsupported" from "hidden".',
  error: 'Probe refused. Nothing was read or written.',
};

const RECOVERY_TEXT: Record<MatrixRecoveryResult, string> = {
  no_pending_rollback: 'No rollback was pending. Tests may run.',
  pending_rollback_restored:
    'A rollback left pending by a previous run was completed and verified. Tests may run.',
  pending_rollback_restore_failed:
    'STOP. A rollback is pending and could not be completed. No test will run, and this app must NOT be uninstalled — its private journal is the only record of the original value.',
  permission_missing:
    'STOP. A rollback is pending but the permission needed to finish it is not held.',
  error:
    'STOP. The pending-rollback check could not be completed, so it is not safe to assume none is pending.',
};

export function DevDiagnosticsScreen() {
  return <DevDiagnosticsLive />;
}

function DevDiagnosticsLive() {
  const [recovery, setRecovery] = useState<MatrixRecoveryResult | null>(null);
  const [canSystem, setCanSystem] = useState<boolean | null>(null);
  const [canSecure, setCanSecure] = useState<boolean | null>(null);
  const [nextIndex, setNextIndex] = useState(0);
  const [tripResults, setTripResults] = useState<Record<string, MatrixRoundTripResult>>({});
  const [probeResults, setProbeResults] = useState<Record<string, MatrixProbeResult>>({});
  const [running, setRunning] = useState<string | null>(null);
  /** Synchronous latch — state updates too late to stop a double tap. */
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // RECOVERY RUNS FIRST, BEFORE ANY TEST CONTROL EXISTS.
      const r = await matrixRecoverPendingRollback().catch(
        () => 'error' as MatrixRecoveryResult,
      );
      if (cancelled) return;
      setRecovery(r);
      setCanSystem(await canWriteSystemSettings().catch(() => false));
      setCanSecure(await canWriteSecureSettings().catch(() => false));
      setNextIndex(await matrixNextAllowedIndex().catch(() => 0));
    })();
    return () => { cancelled = true; };
  }, []);

  const runTrip = useCallback(async (fullKey: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRunning(fullKey);
    try {
      const result = await matrixRoundTrip(fullKey);
      setTripResults((prev) => ({ ...prev, [fullKey]: result }));
    } catch {
      // A bridge fault renders the coarse 'error' and nothing else. The
      // exception text is discarded: it can carry a key or a value.
      setTripResults((prev) => ({ ...prev, [fullKey]: 'error' }));
    } finally {
      // Re-read the gate from NATIVE rather than assuming it advanced. The
      // native side only advances after a verified restoration, so this is
      // the authority on what unlocks next.
      setNextIndex(await matrixNextAllowedIndex().catch(() => nextIndex));
      setRunning(null);
      inFlight.current = false;
    }
  }, [nextIndex]);

  const runProbe = useCallback(async (fullKey: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRunning(fullKey);
    try {
      const result = await matrixProbePresence(fullKey);
      setProbeResults((prev) => ({ ...prev, [fullKey]: result }));
    } catch {
      setProbeResults((prev) => ({ ...prev, [fullKey]: 'error' }));
    } finally {
      setRunning(null);
      inFlight.current = false;
    }
  }, []);

  const recoveryClean =
    recovery === 'no_pending_rollback' || recovery === 'pending_rollback_restored';
  const blocked = Object.keys(tripResults).some(
    (k) => tripResults[k] === 'restore_failed_stop_immediately',
  );

  return (
    <>
      <SectionCard title="System-write matrix" subtitle="Twelve round trips, two probes">
        <Text style={styles.body}>
          Each round trip changes one setting, checks the change took, puts the
          exact original back, and checks that too. No value is ever displayed.
        </Text>
        <Text style={styles.capability}>
          WRITE_SETTINGS (system.*):{' '}
          {canSystem === null ? 'checking…' : canSystem ? 'GRANTED' : 'NOT GRANTED'}
        </Text>
        <Text style={styles.capability}>
          WRITE_SECURE_SETTINGS (secure.*/global.*):{' '}
          {canSecure === null ? 'checking…' : canSecure ? 'GRANTED' : 'NOT GRANTED'}
        </Text>
        <Text style={styles.body}>
          These are two different grants. The first is an appop; the second is
          a runtime permission. Holding one says nothing about the other.
        </Text>
        <Text style={styles.capability}>
          {recovery === null ? 'Checking for a pending rollback…' : RECOVERY_TEXT[recovery]}
        </Text>
      </SectionCard>

      {recovery !== null && !recoveryClean && (
        <SectionCard title="Tests unavailable" subtitle="Pending rollback">
          <Text style={styles.stop}>{RECOVERY_TEXT[recovery]}</Text>
        </SectionCard>
      )}

      {blocked && (
        <SectionCard title="Stopped" subtitle="Restoration could not be verified">
          <Text style={styles.stop}>{TRIP_TEXT.restore_failed_stop_immediately}</Text>
        </SectionCard>
      )}

      {recoveryClean && !blocked && (
        <>
          <SectionCard
            title="Changed-value round trips"
            subtitle="In order. One at a time."
          >
            <Text style={styles.body}>
              Tap them top to bottom. Each stays locked until the one above it
              has been restored and verified. The last one changes font size,
              so the screen will redraw — that is expected.
            </Text>
            {MATRIX_ORDER.map((fullKey, i) => {
              const result = tripResults[fullKey];
              const busy = running === fullKey;
              const locked = i !== nextIndex;
              const off = busy || running !== null || locked;
              return (
                <View key={fullKey} style={styles.row}>
                  <Pressable
                    style={[styles.btn, off && styles.btnOff]}
                    disabled={off}
                    onPress={() => runTrip(fullKey)}
                  >
                    <Text style={styles.btnText}>
                      {busy ? 'Running…' : `${i + 1}. ${fullKey}`}
                    </Text>
                  </Pressable>
                  {locked && !result && (
                    <Text style={styles.result}>Locked until the previous key is verified.</Text>
                  )}
                  {result && <Text style={styles.result}>{TRIP_TEXT[result]}</Text>}
                </View>
              );
            })}
          </SectionCard>

          <SectionCard title="Presence probes" subtitle="Read only — these never write">
            <Text style={styles.body}>
              Both returned no row on the earlier run. These read the provider
              and inspect the platform's own Settings constants. Nothing is
              written, so no key can be created.
            </Text>
            {MATRIX_PROBES.map((fullKey) => {
              const result = probeResults[fullKey];
              const busy = running === fullKey;
              return (
                <View key={fullKey} style={styles.row}>
                  <Pressable
                    style={[styles.btn, running !== null && styles.btnOff]}
                    disabled={running !== null}
                    onPress={() => runProbe(fullKey)}
                  >
                    <Text style={styles.btnText}>{busy ? 'Running…' : fullKey}</Text>
                  </Pressable>
                  {result && <Text style={styles.result}>{PROBE_TEXT[result]}</Text>}
                </View>
              );
            })}
          </SectionCard>
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  body: { color: '#c9cfda', fontSize: 13, lineHeight: 19, marginTop: 8 },
  capability: { color: '#e6b800', fontSize: 13, lineHeight: 19, marginTop: 10 },
  stop: { color: '#f87171', fontSize: 13.5, lineHeight: 20, fontWeight: '600' },
  row: { marginTop: 12 },
  btn: {
    paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10,
    borderWidth: 1, borderColor: '#3a4257', backgroundColor: '#141922',
  },
  btnOff: { opacity: 0.4 },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  result: { color: '#9aa2b1', fontSize: 12.5, lineHeight: 18, marginTop: 6 },
});
