import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Image, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SignInScreen } from './src/screens/SignInScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { ScanScreen } from './src/screens/ScanScreen';
import { CompareScreen } from './src/screens/CompareScreen';
import { RestoreScreen } from './src/screens/RestoreScreen';
import type { AppTab, ComparisonResult, DeviceProfile, ScanProgress } from './src/types/profile';
import { buildProfile } from './src/services/profileBuilder';
import { compareProfiles } from './src/services/profileCompare';
import { exportProfileJson, saveProfileLocally, importProfileFromUri } from './src/services/profileIO';
import { saveProfileToCloud } from './src/services/cloudProfiles';
import { onAuthChanged, signOutUser, type User } from './src/services/firebase';
import { TabButton } from './src/components/TabButton';

const STORAGE_KEY_PROFILE = 'afterswitch_current_profile';
const STORAGE_KEY_IMPORTED = 'afterswitch_imported_profile';

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined); // undefined = loading
  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [currentProfile, setCurrentProfile] = useState<DeviceProfile | null>(null);
  const [importedProfile, setImportedProfile] = useState<DeviceProfile | null>(null);
  const [statusMessage, setStatusMessage] = useState('Ready.');
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
  const [cloudSaving, setCloudSaving] = useState(false);
  const [savedFileName, setSavedFileName] = useState<string | null>(null);

  // Listen for Firebase auth state
  useEffect(() => {
    const unsub = onAuthChanged((u) => {
      setUser(u);
    });
    return unsub;
  }, []);

  // Handle incoming JSON file (from intent — user tapped a JSON in another app)
  const handleIncomingFile = useCallback(async (url: string) => {
    if (!url) return;
    if (!url.startsWith('content://') && !url.startsWith('file://')) return;

    try {
      const profile = await importProfileFromUri(url);
      setImportedProfile(profile);
      await AsyncStorage.setItem(STORAGE_KEY_IMPORTED, JSON.stringify(profile));
      setStatusMessage(`Imported profile from ${profile.device.nickname}.`);
      setActiveTab('compare');
    } catch (error) {
      setStatusMessage(`Import failed: ${String(error)}`);
    }
  }, []);

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
      } catch (e) {
        console.log('Failed to load saved profiles:', e);
      }

      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) {
        handleIncomingFile(initialUrl);
      }
    })();

    const sub = Linking.addEventListener('url', ({ url }) => {
      handleIncomingFile(url);
    });

    return () => sub.remove();
  }, [handleIncomingFile]);

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
      // Save locally
      const savedUri = saveProfileLocally(profile);
      const fileName = decodeURIComponent(savedUri.split('/').pop() || 'profile');
      setSavedFileName(fileName);
      setStatusMessage(`Saved: ${fileName}`);

      // Auto-save to cloud (fire-and-forget)
      setCloudSaving(true);
      saveProfileToCloud(profile)
        .then((id) => {
          setStatusMessage(`Saved locally + cloud (${id})`);
        })
        .catch((e) => {
          console.log('Cloud save failed:', e);
          setStatusMessage(`Saved locally. Cloud save failed.`);
        })
        .finally(() => {
          setCloudSaving(false);
        });
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

  const handleSelectCloudProfile = useCallback(async (profile: DeviceProfile) => {
    setImportedProfile(profile);
    await AsyncStorage.setItem(STORAGE_KEY_IMPORTED, JSON.stringify(profile));
    setStatusMessage(`Loaded profile from ${profile.device.nickname}.`);
    // Save locally as cache
    saveProfileLocally(profile);
    setActiveTab('compare');
  }, []);

  const handleSignOut = useCallback(async () => {
    try {
      await signOutUser();
      setUser(null);
    } catch (e) {
      setStatusMessage(`Sign out failed: ${String(e)}`);
    }
  }, []);

  // Loading state while checking auth
  if (user === undefined) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.loadingContainer}>
            <Image source={require('./assets/icon.png')} style={styles.loadingIcon} />
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  // Not signed in — show sign-in screen
  if (!user) {
    return (
      <SafeAreaProvider>
        <SignInScreen onSignedIn={() => {}} />
      </SafeAreaProvider>
    );
  }

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
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {activeTab === 'home' && (
            <HomeScreen
              profile={currentProfile}
              lastScanTime={currentProfile?.exportedAt ?? null}
              onScan={handleScan}
              onExport={handleExport}
              cloudSaving={cloudSaving}
              userName={user.displayName || user.email || 'Signed in'}
              onSignOut={handleSignOut}
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
              onSelectCloudProfile={handleSelectCloudProfile}
            />
          )}
          {activeTab === 'restore' && (
            <RestoreScreen
              comparison={comparison}
              onSelectCloudProfile={handleSelectCloudProfile}
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingIcon: {
    width: 64,
    height: 64,
    borderRadius: 14,
    opacity: 0.6,
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
