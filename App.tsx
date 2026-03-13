import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Image, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { HomeScreen } from './src/screens/HomeScreen';
import { ScanScreen } from './src/screens/ScanScreen';
import { CompareScreen } from './src/screens/CompareScreen';
import { RestoreScreen } from './src/screens/RestoreScreen';
import { CloudProfilesScreen } from './src/screens/CloudProfilesScreen';
import type { AppTab, ComparisonResult, DeviceProfile, ScanProgress } from './src/types/profile';
import { buildProfile } from './src/services/profileBuilder';
import { compareProfiles } from './src/services/profileCompare';
import { exportProfileJson, saveProfileLocally, importProfileFromUri, loadProfileFromPath, listSavedProfiles } from './src/services/profileIO';
import type { SavedProfileInfo } from './src/services/profileIO';
import { saveProfileToCloud } from './src/services/cloudProfiles';
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
  const [cloudSaving, setCloudSaving] = useState(false);
  const [savedProfiles, setSavedProfiles] = useState<SavedProfileInfo[]>([]);
  const [savedFileName, setSavedFileName] = useState<string | null>(null);

  // Handle incoming JSON file (from intent — user tapped a JSON in another app)
  const handleIncomingFile = useCallback(async (url: string) => {
    if (!url) return;
    // Only handle content:// and file:// URIs (not afterswitch:// scheme links)
    if (!url.startsWith('content://') && !url.startsWith('file://')) return;

    try {
      const profile = await importProfileFromUri(url);
      setImportedProfile(profile);
      await AsyncStorage.setItem(STORAGE_KEY_IMPORTED, JSON.stringify(profile));
      refreshSavedProfiles();
      setStatusMessage(`Imported profile from ${profile.device.nickname}.`);
      setActiveTab('compare');
    } catch (error) {
      setStatusMessage(`Import failed: ${String(error)}`);
    }
  }, [refreshSavedProfiles]);

  // Load saved profiles on mount + check for incoming file intent
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
        // Load saved profile files list
        setSavedProfiles(listSavedProfiles());
      } catch (e) {
        console.log('Failed to load saved profiles:', e);
      }

      // Check if app was opened by tapping a JSON file (cold start)
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) {
        handleIncomingFile(initialUrl);
      }
    })();

    // Listen for JSON files opened while app is already running (warm start)
    const sub = Linking.addEventListener('url', ({ url }) => {
      handleIncomingFile(url);
    });

    return () => sub.remove();
  }, [handleIncomingFile]);

  const refreshSavedProfiles = useCallback(() => {
    setSavedProfiles(listSavedProfiles());
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
      // Auto-save to profiles directory
      const savedUri = saveProfileLocally(profile);
      refreshSavedProfiles();

      const fileName = decodeURIComponent(savedUri.split('/').pop() || 'profile');
      setSavedFileName(fileName);
      setStatusMessage(`Saved: ${fileName}`);
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
      const fileName = uri.split('/').pop() || 'profile';
      setStatusMessage(`Shared: ${decodeURIComponent(fileName)}`);
    } catch (error) {
      setStatusMessage(`Export failed: ${String(error)}`);
    }
  }, [currentProfile]);

  const handleSaveToCloud = useCallback(async () => {
    if (!currentProfile) {
      setStatusMessage('No profile to save. Scan first.');
      return;
    }
    setCloudSaving(true);
    try {
      const profileId = await saveProfileToCloud(currentProfile);
      setStatusMessage(`Saved to cloud: ${profileId}`);
    } catch (error) {
      setStatusMessage(`Cloud save failed: ${String(error)}`);
    } finally {
      setCloudSaving(false);
    }
  }, [currentProfile]);

  const handleLoadFromCloud = useCallback(() => {
    setActiveTab('cloud');
  }, []);

  const handleCloudSelect = useCallback(async (profile: DeviceProfile) => {
    setImportedProfile(profile);
    await AsyncStorage.setItem(STORAGE_KEY_IMPORTED, JSON.stringify(profile));
    setStatusMessage(`Loaded cloud profile from ${profile.device.nickname}.`);
    setActiveTab('compare');
  }, []);


  const handleSelectSavedProfile = useCallback(async (info: SavedProfileInfo) => {
    try {
      const profile = await loadProfileFromPath(info.filePath);
      setImportedProfile(profile);
      await AsyncStorage.setItem(STORAGE_KEY_IMPORTED, JSON.stringify(profile));
      setStatusMessage(`Loaded profile from ${profile.device.nickname}.`);
      setActiveTab('compare');
    } catch (error) {
      setStatusMessage(`Failed to load profile: ${String(error)}`);
    }
  }, []);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <Image
              source={require('./assets/icon.png')}
              style={styles.headerIcon}
            />
            <Text style={styles.title}>AfterSwitch</Text>
          </View>
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
          <TabButton
            label="Cloud"
            active={activeTab === 'cloud'}
            onPress={() => setActiveTab('cloud')}
          />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {activeTab === 'home' && (
            <HomeScreen
              profile={currentProfile}
              lastScanTime={currentProfile?.exportedAt ?? null}
              onScan={handleScan}
              onExport={handleExport}
              onSaveToCloud={handleSaveToCloud}
              onLoadFromCloud={handleLoadFromCloud}
              cloudSaving={cloudSaving}
              savedProfiles={savedProfiles}
              onSelectSavedProfile={handleSelectSavedProfile}
            />
          )}
          {activeTab === 'scan' && (
            <ScanScreen
              profile={currentProfile}
              scanning={scanning}
              scanProgress={scanProgress}
              savedFileName={savedFileName}
              onExport={handleExport}
            />
          )}
          {activeTab === 'compare' && (
            <CompareScreen
              currentProfile={currentProfile}
              importedProfile={importedProfile}
              comparison={comparison}
              savedProfiles={savedProfiles}
              onSelectSavedProfile={handleSelectSavedProfile}
            />
          )}
          {activeTab === 'restore' && (
            <RestoreScreen
              comparison={comparison}
              savedProfiles={savedProfiles}
              onSelectSavedProfile={handleSelectSavedProfile}
            />
          )}
          {activeTab === 'cloud' && (
            <CloudProfilesScreen
              onSelect={handleCloudSelect}
              onBack={() => setActiveTab('home')}
            />
          )}
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
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
