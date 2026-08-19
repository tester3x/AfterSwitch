/**
 * TEMPORARY EXPERIMENT ENTRY POINT — delete after the matrix run.
 *
 * Registers ONLY the diagnostic screen. It deliberately does not import
 * App.tsx, so nothing in the production tree loads: no Firebase (whose
 * config is hardcoded and whose initializeApp runs at module load), no auth
 * gate, no cloud, no sharing, no companion networking, no profile IO, and
 * none of the production restore path.
 *
 * The import chain from here reaches react-native and the settings bridge
 * only. That is asserted by scripts/test-system-matrix-probe.mjs rather
 * than trusted.
 */
import { registerRootComponent } from 'expo';
import React from 'react';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { DevDiagnosticsScreen } from './src/screens/DevDiagnosticsScreen';

function DiagnosticRoot() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" />
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.banner}>
            <Text style={styles.bannerTitle}>AfterSwitch Diagnostic</Text>
            <Text style={styles.bannerText}>
              Temporary experiment build. Separate package, separate signing
              identity, separate data. It cannot read or change your real
              AfterSwitch profiles, and it does not contain the production
              restore path.
            </Text>
          </View>
          <DevDiagnosticsScreen />
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0b0e14' },
  content: { padding: 14 },
  banner: {
    backgroundColor: '#3a2a00', borderColor: '#e6b800', borderWidth: 1,
    borderRadius: 12, padding: 14, marginBottom: 14,
  },
  bannerTitle: { color: '#e6b800', fontSize: 17, fontWeight: '800' },
  bannerText: { color: '#e8dcae', fontSize: 13, lineHeight: 19, marginTop: 6 },
});

registerRootComponent(DiagnosticRoot);
