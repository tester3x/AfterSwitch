import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { HomeScreen } from './src/screens/HomeScreen';
import { ScanScreen } from './src/screens/ScanScreen';
import { CompareScreen } from './src/screens/CompareScreen';
import { RestoreScreen } from './src/screens/RestoreScreen';
import type { AppTab, ComparisonResult, DeviceProfile, ScanProgress } from './src/types/profile';
import { buildProfile } from './src/services/profileBuilder';
import { compareProfiles } from './src/services/profileCompare';
import { exportProfileJson, importProfileFromPicker } from './src/services/profileIO';
import { TabButton } from './src/components/TabButton';

const STORAGE_KEY_PROFILE = 'afterswitch_current_profile';
const STORAGE_KEY_IMPORTED = 'afterswitch_imported_profile';

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [currentProfile, setCurrentProfile] = useState<DeviceProfile | null>(null);
  const [importedProfile, setImportedProfile] = useState<DeviceProfile | null>(null);
  const [statusMessage, setStatusMessage] = useState('Ready.');
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);

  // Load saved profiles on mount
  useEffect(() => {
    (async () => {
      try {
        const savedProfile = await AsyncStorage.getItem(STORAGE_KEY_PROFILE);
        if (savedProfile) {
          setCurrentProfile(JSON.parse(savedProfile));
        }
        const savedImported = await AsyncStorage.getItem(STORAGE_KEY_IMPORTED);
        if (savedImported) {
          setImportedProfile(JSON.parse(savedImported));
        }
      } catch (e) {
        console.log('Failed to load saved profiles:', e);
      }
    })();
  }, []);

  // Compare profiles whenever either changes
  const comparison: ComparisonResult | null = useMemo(() => {
    if (!currentProfile || !importedProfile) return null;
    return compareProfiles(currentProfile, importedProfile);
  }, [currentProfile, importedProfile]);

  const handleScan = useCallback(async () => {
    setScanning(true);
    setScanProgress({
      system: false,
      secure: false,
      global: false,
      samsung: false,
      device: false,
      apps: false,
      defaults: false,
    });
    setActiveTab('scan');

    try {
      const profile = await buildProfile((progress) => {
        setScanProgress({ ...progress });
      });
      setCurrentProfile(profile);
      await AsyncStorage.setItem(STORAGE_KEY_PROFILE, JSON.stringify(profile));

      const totalSettings =
        Object.keys(profile.settings.system).length +
        Object.keys(profile.settings.secure).length +
        Object.keys(profile.settings.global).length +
        Object.keys(profile.settings.samsung).length;
      setStatusMessage(
        `Scan complete: ${totalSettings} settings + ${profile.apps.installed.length} apps captured.`
      );
    } catch (error) {
      setStatusMessage(`Scan failed: ${String(error)}`);
    } finally {
      setScanning(false);
    }
  }, []);

  const handleExport = useCallback(async () => {
    if (!currentProfile) {
      setStatusMessage('No profile to export. Scan first.');
      return;
    }
    try {
      const uri = await exportProfileJson(currentProfile);
      setStatusMessage(`Exported: ${uri}`);
    } catch (error) {
      setStatusMessage(`Export failed: ${String(error)}`);
    }
  }, [currentProfile]);

  const handleImport = useCallback(async () => {
    try {
      const imported = await importProfileFromPicker();
      if (!imported) {
        setStatusMessage('Import canceled.');
        return;
      }
      setImportedProfile(imported);
      await AsyncStorage.setItem(STORAGE_KEY_IMPORTED, JSON.stringify(imported));
      setStatusMessage(`Imported profile from ${imported.device.nickname}.`);
      setActiveTab('compare');
    } catch (error) {
      setStatusMessage(`Import failed: ${String(error)}`);
    }
  }, []);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Text style={styles.title}>AfterSwitch</Text>
          <Text style={styles.subtitle}>Your phone settings, backed up and restorable.</Text>
        </View>

        <View style={styles.tabRow}>
          <TabButton
            label="Home"
            active={activeTab === 'home'}
            onPress={() => setActiveTab('home')}
          />
          <TabButton
            label="Scan"
            active={activeTab === 'scan'}
            onPress={() => setActiveTab('scan')}
          />
          <TabButton
            label="Compare"
            active={activeTab === 'compare'}
            onPress={() => setActiveTab('compare')}
          />
          <TabButton
            label="Restore"
            active={activeTab === 'restore'}
            onPress={() => setActiveTab('restore')}
          />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {activeTab === 'home' && (
            <HomeScreen
              profile={currentProfile}
              lastScanTime={currentProfile?.exportedAt ?? null}
              onScan={handleScan}
              onImport={handleImport}
            />
          )}
          {activeTab === 'scan' && (
            <ScanScreen
              profile={currentProfile}
              scanning={scanning}
              scanProgress={scanProgress}
              onExport={handleExport}
            />
          )}
          {activeTab === 'compare' && (
            <CompareScreen
              currentProfile={currentProfile}
              importedProfile={importedProfile}
              comparison={comparison}
              onImport={handleImport}
            />
          )}
          {activeTab === 'restore' && <RestoreScreen comparison={comparison} />}
        </ScrollView>

        <View style={styles.footer}>
          <Text style={styles.footerText}>{statusMessage}</Text>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0b1020',
  },
  header: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 12,
  },
  title: {
    color: 'white',
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    color: '#b7c1d6',
    fontSize: 14,
    marginTop: 4,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 8,
    flexWrap: 'wrap',
  },
  content: {
    padding: 14,
    gap: 12,
    paddingBottom: 24,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2e3853',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  footerText: {
    color: '#d7def0',
    fontSize: 12,
  },
});
