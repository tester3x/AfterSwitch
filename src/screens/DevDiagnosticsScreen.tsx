/**
 * DEVELOPMENT DIAGNOSTICS — excluded from production builds.
 *
 * Exists to answer TWO questions with evidence instead of assumption:
 *
 *   1. With WRITE_SECURE_SETTINGS granted, can this app write a KNOWN
 *      EXISTING system key at all? (same-value probe, already answered)
 *   2. Can it CHANGE that value, see the change through a fresh read, and
 *      put the exact original back? (round trip — the decisive question)
 *
 * A same-value write may be a no-op the provider accepts trivially. Only a
 * changed value exercises the path a real restore takes, which is why the
 * round trip is the one that decides whether the desktop companion must
 * remain a live write bridge (Design B) or can shrink to a one-time
 * permission-granting utility (Design A).
 *
 * Neither probe is ever invoked by scan, restore, startup or any background
 * path — only by a deliberate tap here.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SectionCard } from '../components/SectionCard';
import {
  DIAGNOSTIC_KEYS,
  ROUNDTRIP_KEYS,
  diagnosticRecoverPendingRollback,
  diagnosticRoundTrip,
  diagnosticSameValueWrite,
  secureWriteCapability,
  type DiagnosticNamespace,
  type DiagnosticRecoveryResult,
  type DiagnosticRoundTripResult,
  type DiagnosticWriteResult,
  type SecureWriteCapability,
} from '../services/settingsReader';

/**
 * ISOLATION IS STRUCTURAL, NOT FLAG-BASED.
 *
 * This deliberately does NOT gate on a development flag. An EAS
 * internal-distribution APK is a release-style bundle where such a flag is
 * false, so a flag gate would render nothing and the experiment could not
 * run at all.
 *
 * What keeps this out of the real app is stronger than a flag: it ships in a
 * SEPARATE Android package (com.afterswitch.app.devdiag) built from a
 * SEPARATE entry point (index.diagnostic.js) that never imports App.tsx.
 * Nothing in the production package references this file, so it cannot be
 * reached there regardless of build type — and this whole branch is never
 * merged to main.
 */

const CAPABILITY_TEXT: Record<SecureWriteCapability, string> = {
  unavailable: 'No native module in this build — the probe cannot run.',
  not_granted:
    'WRITE_SECURE_SETTINGS is NOT granted. Grant it over ADB first, then reopen this screen.',
  granted_untested:
    'WRITE_SECURE_SETTINGS is granted. Whether a known system key can actually be written is UNTESTED — that is what the probes below determine.',
};

const RESULT_TEXT: Record<DiagnosticWriteResult, string> = {
  permission_missing: 'Permission missing — nothing was written.',
  key_not_present: 'That key does not exist on this device — nothing was written.',
  same_value_write_succeeded:
    'WROTE the existing value back successfully. Direct app writes work for this key.',
  security_exception:
    'SecurityException — Android refused the write despite the permission being held.',
  system_overrode:
    'The write was accepted but the system replaced the value afterwards.',
  error: 'Refused or failed. Nothing was written.',
};

const TRIP_TEXT: Record<DiagnosticRoundTripResult, string> = {
  round_trip_succeeded:
    'CHANGED the value, confirmed the change by a fresh read, restored the exact original, and confirmed the restoration. Direct app writes really do work.',
  key_not_present: 'No row exists for that key on this device — nothing was written.',
  change_write_failed_original_intact:
    'Android REFUSED the changed-value write. The original was never modified.',
  change_not_persisted_original_restored:
    'The write was accepted but the fresh read disagreed, so it did not persist. The original is back.',
  restore_succeeded_after_test_failure:
    'The test failed partway, but the original was restored and verified.',
  restore_failed_stop_immediately:
    'STOP. The restoration could not be verified. The rollback journal is still pending and will be retried on the next launch. Do not uninstall the diagnostic app.',
  permission_missing: 'Permission missing — nothing was written.',
  error: 'Refused, out of order, or unusable. Nothing was written.',
};

const RECOVERY_TEXT: Record<DiagnosticRecoveryResult, string> = {
  no_pending_rollback: 'No rollback was pending. Tests may run.',
  pending_rollback_restored:
    'A rollback left pending by a previous run was completed and verified. Tests may run.',
  pending_rollback_restore_failed:
    'STOP. A rollback is pending and could not be completed. No test will run, and the diagnostic app must NOT be uninstalled — its private journal is the only record of the original value.',
  permission_missing:
    'STOP. A rollback is pending but WRITE_SECURE_SETTINGS is not held, so it cannot be completed. Grant the permission over ADB and reopen this screen.',
  error:
    'STOP. The pending-rollback check could not be completed, so it is not safe to assume none is pending.',
};

export function DevDiagnosticsScreen() {
  return <DevDiagnosticsLive />;
}

function DevDiagnosticsLive() {
  const [capability, setCapability] = useState<SecureWriteCapability | null>(null);
  const [recovery, setRecovery] = useState<DiagnosticRecoveryResult | null>(null);
  const [results, setResults] = useState<Record<string, DiagnosticWriteResult>>({});
  const [tripResults, setTripResults] = useState<Record<string, DiagnosticRoundTripResult>>({});
  const [running, setRunning] = useState<string | null>(null);
  /** Synchronous latch — state updates too late to stop a double tap. */
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // RECOVERY RUNS FIRST, BEFORE ANY TEST UI EXISTS. A rollback stranded
      // by process death must be finished before another mutation is even
      // offered. An unreachable bridge resolves to 'error', which blocks.
      const recovered = await diagnosticRecoverPendingRollback().catch(
        () => 'error' as DiagnosticRecoveryResult,
      );
      if (cancelled) return;
      setRecovery(recovered);

      const c = await secureWriteCapability().catch(
        () => 'unavailable' as SecureWriteCapability,
      );
      if (!cancelled) setCapability(c);
    })();
    return () => { cancelled = true; };
  }, []);

  const runProbe = useCallback(async (namespace: DiagnosticNamespace, key: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    const id = `${namespace}.${key}`;
    setRunning(id);
    try {
      const result = await diagnosticSameValueWrite(namespace, key);
      setResults((prev) => ({ ...prev, [id]: result }));
    } catch {
      // A missing native method, a rejected bridge promise, or any unexpected
      // throw renders the coarse 'error' and nothing else. The exception text
      // is deliberately discarded: it can carry a key name or a value, and no
      // setting value may ever reach the screen.
      //
      // Without this catch the rejection went unhandled, no result was set,
      // and a build whose native method was missing simply looked like a
      // button that did nothing.
      setResults((prev) => ({ ...prev, [id]: 'error' }));
    } finally {
      // Always release the button, on success and on failure alike.
      setRunning(null);
      inFlight.current = false;
    }
  }, []);

  const runRoundTrip = useCallback(async (namespace: DiagnosticNamespace, key: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    const id = `trip.${namespace}.${key}`;
    setRunning(id);
    try {
      const result = await diagnosticRoundTrip(namespace, key);
      setTripResults((prev) => ({ ...prev, [id]: result }));
    } catch {
      // Same discipline as above. A bridge failure is a coarse 'error' and
      // never carries the exception text, which could contain a value.
      //
      // 'error' is also the safe reading here: the native side restores in a
      // finally path and keeps its journal if that restore is unverified, so
      // a bridge-level failure cannot leave a change silently accepted.
      setTripResults((prev) => ({ ...prev, [id]: 'error' }));
    } finally {
      setRunning(null);
      inFlight.current = false;
    }
  }, []);

  const ready = capability === 'granted_untested';

  const recoveryClean =
    recovery === 'no_pending_rollback' || recovery === 'pending_rollback_restored';
  /** Any restoration failure blocks every further test. */
  const blocked = Object.keys(tripResults).some(
    (k) => tripResults[k] === 'restore_failed_stop_immediately',
  );
  const secureTrip = tripResults['trip.secure.long_press_timeout'];
  /** Global does not run while Secure restoration is unverified. */
  const secureVerified =
    secureTrip !== undefined && secureTrip !== 'restore_failed_stop_immediately';

  return (
    <>
      <SectionCard title="Developer Diagnostics" subtitle="Not present in release builds">
        <Text style={styles.body}>
          Decides whether the desktop companion must stay a live write bridge.
        </Text>
        <Text style={styles.capability}>
          {capability === null ? 'Checking permission…' : CAPABILITY_TEXT[capability]}
        </Text>
        <Text style={styles.capability}>
          {recovery === null
            ? 'Checking for a pending rollback…'
            : RECOVERY_TEXT[recovery]}
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
            title="Changed-value round trip"
            subtitle="Writes a different value, then puts the exact original back"
          >
            <Text style={styles.body}>
              Reads the key, writes a DIFFERENT valid value, verifies the change
              by a fresh read, then restores the exact original in a finally path
              and verifies that too. The original is journalled to this app's
              private storage before anything is written, so process death cannot
              strand the setting. No value is ever shown.
            </Text>
            <Text style={styles.body}>
              Secure runs first. Global stays disabled until the Secure
              restoration has been verified.
            </Text>
            {(['secure', 'global'] as DiagnosticNamespace[]).map((namespace) =>
              ROUNDTRIP_KEYS[namespace].map((key) => {
                const id = `trip.${namespace}.${key}`;
                const result = tripResults[id];
                const busy = running === id;
                const gated = namespace === 'global' && !secureVerified;
                const off = !ready || running !== null || gated;
                return (
                  <View key={id} style={styles.row}>
                    <Pressable
                      style={[styles.btn, off && styles.btnOff]}
                      disabled={off}
                      onPress={() => runRoundTrip(namespace, key)}
                    >
                      <Text style={styles.btnText}>
                        {busy ? 'Running…' : `${namespace}.${key}`}
                      </Text>
                    </Pressable>
                    {gated && (
                      <Text style={styles.result}>
                        Waiting on a verified Secure round trip.
                      </Text>
                    )}
                    {result && <Text style={styles.result}>{TRIP_TEXT[result]}</Text>}
                  </View>
                );
              }),
            )}
          </SectionCard>

          {(['secure', 'global'] as DiagnosticNamespace[]).map((namespace) => (
            <SectionCard
              key={namespace}
              title={`${namespace === 'secure' ? 'Secure' : 'Global'} same-value write`}
              subtitle="Writes the existing value back unchanged"
            >
              <Text style={styles.body}>
                Each button reads the key, then writes back the exact value it just
                read. Nothing observable changes. The value itself is never shown.
              </Text>
              {DIAGNOSTIC_KEYS[namespace].map((key) => {
                const id = `${namespace}.${key}`;
                const result = results[id];
                const busy = running === id;
                return (
                  <View key={id} style={styles.row}>
                    <Pressable
                      style={[styles.btn, (!ready || running !== null) && styles.btnOff]}
                      disabled={!ready || running !== null}
                      onPress={() => runProbe(namespace, key)}
                    >
                      <Text style={styles.btnText}>{busy ? 'Running…' : key}</Text>
                    </Pressable>
                    {result && <Text style={styles.result}>{RESULT_TEXT[result]}</Text>}
                  </View>
                );
              })}
            </SectionCard>
          ))}
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  body: { color: '#c9cfda', fontSize: 13, lineHeight: 19 },
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
