/**
 * DEVELOPMENT DIAGNOSTICS — excluded from production builds.
 *
 * Exists to answer ONE question with evidence instead of assumption:
 * with WRITE_SECURE_SETTINGS granted, can this app write a KNOWN EXISTING
 * system key? That decides whether the desktop companion must remain a live
 * write bridge (Design B) or can shrink to a one-time permission-granting
 * utility that runs no server at all (Design A).
 *
 * The probe writes the value it just read, so nothing observable changes.
 * It is never invoked by scan, restore, startup or any background path —
 * only by a deliberate tap here, separately for Secure and for Global.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SectionCard } from '../components/SectionCard';
import {
  DIAGNOSTIC_KEYS,
  diagnosticSameValueWrite,
  secureWriteCapability,
  type DiagnosticNamespace,
  type DiagnosticWriteResult,
  type SecureWriteCapability,
} from '../services/settingsReader';

/**
 * ISOLATION IS STRUCTURAL, NOT FLAG-BASED.
 *
 * This deliberately does NOT gate on __DEV__. An EAS internal-distribution
 * APK is a release-style bundle where __DEV__ is false, so a __DEV__ gate
 * would render nothing and the experiment could not run at all.
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
    'WRITE_SECURE_SETTINGS is granted. Whether a known system key can actually be written is UNTESTED — that is what the probe below determines.',
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

export function DevDiagnosticsScreen() {
  return <DevDiagnosticsLive />;
}

function DevDiagnosticsLive() {
  const [capability, setCapability] = useState<SecureWriteCapability | null>(null);
  const [results, setResults] = useState<Record<string, DiagnosticWriteResult>>({});
  const [running, setRunning] = useState<string | null>(null);
  /** Synchronous latch — state updates too late to stop a double tap. */
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const c = await secureWriteCapability();
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

  const ready = capability === 'granted_untested';

  return (
    <>
      <SectionCard title="Developer Diagnostics" subtitle="Not present in release builds">
        <Text style={styles.body}>
          Decides whether the desktop companion must stay a live write bridge.
        </Text>
        <Text style={styles.capability}>
          {capability === null ? 'Checking permission…' : CAPABILITY_TEXT[capability]}
        </Text>
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
  );
}

const styles = StyleSheet.create({
  body: { color: '#c9cfda', fontSize: 13, lineHeight: 19 },
  capability: { color: '#e6b800', fontSize: 13, lineHeight: 19, marginTop: 10 },
  row: { marginTop: 12 },
  btn: {
    paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10,
    borderWidth: 1, borderColor: '#3a4257', backgroundColor: '#141922',
  },
  btnOff: { opacity: 0.4 },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  result: { color: '#9aa2b1', fontSize: 12.5, lineHeight: 18, marginTop: 6 },
});
