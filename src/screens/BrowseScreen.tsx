import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SectionCard } from '../components/SectionCard';
import { PrimaryButton } from '../components/PrimaryButton';
import { QRScannerModal } from '../components/QRScannerModal';
import {
  browseSharedProfiles,
  getProfileByShareCode,
  type SharedProfileMeta,
} from '../services/sharedProfiles';
import type { DeviceProfile } from '../types/profile';
import type { QueryDocumentSnapshot } from 'firebase/firestore';

type Props = {
  onSelectProfile: (profile: DeviceProfile) => void;
};

const MANUFACTURERS = ['Samsung', 'Google', 'OnePlus', 'Xiaomi', 'Motorola'];

export function BrowseScreen({ onSelectProfile }: Props) {
  const [profiles, setProfiles] = useState<SharedProfileMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedManufacturer, setSelectedManufacturer] = useState<string | null>(null);

  // Share code lookup
  const [codeInput, setCodeInput] = useState('');
  const [codeLooking, setCodeLooking] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  // QR scanner
  const [scannerVisible, setScannerVisible] = useState(false);

  const fetchProfiles = useCallback(
    async (reset = true) => {
      if (reset) {
        setLoading(true);
        setLastDoc(null);
        setHasMore(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);

      try {
        const result = await browseSharedProfiles({
          manufacturer: selectedManufacturer || undefined,
          pageSize: 20,
          afterDoc: reset ? undefined : (lastDoc ?? undefined),
        });

        if (reset) {
          setProfiles(result.profiles);
        } else {
          setProfiles((prev) => [...prev, ...result.profiles]);
        }
        setLastDoc(result.lastDoc);
        setHasMore(result.profiles.length >= 20);
      } catch (e) {
        setError(`Failed to load: ${String(e)}`);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [selectedManufacturer, lastDoc],
  );

  useEffect(() => {
    fetchProfiles(true);
  }, [selectedManufacturer]);

  const handleSelectProfile = useCallback(
    async (meta: SharedProfileMeta) => {
      setLoadingId(meta.id);
      try {
        const profile = await getProfileByShareCode(meta.shareCode);
        if (!profile) {
          setError('Profile not found.');
          return;
        }
        onSelectProfile(profile);
      } catch (e) {
        setError(`Failed to load profile: ${String(e)}`);
      } finally {
        setLoadingId(null);
      }
    },
    [onSelectProfile],
  );

  const handleCodeLookup = useCallback(async () => {
    const code = codeInput.trim().toUpperCase();
    if (code.length < 4) {
      setCodeError('Enter a valid share code.');
      return;
    }
    setCodeLooking(true);
    setCodeError(null);
    try {
      const profile = await getProfileByShareCode(code);
      if (!profile) {
        setCodeError('No profile found with that code.');
        return;
      }
      setCodeInput('');
      onSelectProfile(profile);
    } catch (e) {
      setCodeError(`Lookup failed: ${String(e)}`);
    } finally {
      setCodeLooking(false);
    }
  }, [codeInput, onSelectProfile]);

  const handleQRResult = useCallback(
    (code: string) => {
      setScannerVisible(false);
      setCodeInput(code);
      // Auto-lookup
      setCodeLooking(true);
      setCodeError(null);
      getProfileByShareCode(code)
        .then((profile) => {
          if (!profile) {
            setCodeError('No profile found for that QR code.');
            return;
          }
          onSelectProfile(profile);
        })
        .catch((e) => setCodeError(`QR lookup failed: ${String(e)}`))
        .finally(() => setCodeLooking(false));
    },
    [onSelectProfile],
  );

  return (
    <>
      {/* Quick Access — code entry + QR scan */}
      <SectionCard title="Find a Profile">
        <View style={styles.codeRow}>
          <TextInput
            style={styles.codeInput}
            placeholder="Enter share code..."
            placeholderTextColor="#4a5a7a"
            value={codeInput}
            onChangeText={setCodeInput}
            autoCapitalize="characters"
            maxLength={7}
          />
          {codeLooking ? (
            <ActivityIndicator size="small" color="#e6b800" />
          ) : (
            <Pressable style={styles.goBtn} onPress={handleCodeLookup}>
              <Text style={styles.goBtnText}>Go</Text>
            </Pressable>
          )}
        </View>

        <Pressable style={styles.qrBtn} onPress={() => setScannerVisible(true)}>
          <Text style={styles.qrBtnText}>Scan QR Code</Text>
        </Pressable>

        {codeError && <Text style={styles.codeError}>{codeError}</Text>}
      </SectionCard>

      {/* Community Gallery */}
      <SectionCard title="Community Profiles" subtitle="Browse shared phone setups">
        {/* Manufacturer filter pills */}
        <View style={styles.filterRow}>
          <Pressable
            style={[styles.filterPill, !selectedManufacturer && styles.filterPillActive]}
            onPress={() => setSelectedManufacturer(null)}
          >
            <Text
              style={[
                styles.filterText,
                !selectedManufacturer && styles.filterTextActive,
              ]}
            >
              All
            </Text>
          </Pressable>
          {MANUFACTURERS.map((m) => (
            <Pressable
              key={m}
              style={[
                styles.filterPill,
                selectedManufacturer === m && styles.filterPillActive,
              ]}
              onPress={() =>
                setSelectedManufacturer(selectedManufacturer === m ? null : m)
              }
            >
              <Text
                style={[
                  styles.filterText,
                  selectedManufacturer === m && styles.filterTextActive,
                ]}
              >
                {m}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Loading */}
        {loading && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#e6b800" />
            <Text style={styles.loadingText}>Loading community profiles...</Text>
          </View>
        )}

        {/* Error */}
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Empty state */}
        {!loading && !error && profiles.length === 0 && (
          <Text style={styles.emptyText}>
            No shared profiles yet. Be the first — share yours from the Home tab!
          </Text>
        )}

        {/* Profile list */}
        {!loading &&
          profiles.map((meta) => (
            <Pressable
              key={meta.id}
              style={styles.profileCard}
              onPress={() => handleSelectProfile(meta)}
            >
              <View style={styles.profileTop}>
                <View style={styles.profileInfo}>
                  <Text style={styles.profileDevice}>
                    {meta.manufacturer} {meta.model}
                  </Text>
                  <Text style={styles.profileName}>{meta.deviceName}</Text>
                </View>
                {loadingId === meta.id ? (
                  <ActivityIndicator size="small" color="#e6b800" />
                ) : (
                  <Text style={styles.arrow}>›</Text>
                )}
              </View>
              <View style={styles.profileBottom}>
                <Text style={styles.profileStat}>
                  {meta.settingsCount} settings · {meta.appsCount} apps
                </Text>
                <Text style={styles.profileStat}>
                  by {meta.ownerName}
                </Text>
                {meta.downloads > 0 && (
                  <Text style={styles.downloadBadge}>
                    {meta.downloads} download{meta.downloads !== 1 ? 's' : ''}
                  </Text>
                )}
              </View>
            </Pressable>
          ))}

        {/* Load more */}
        {!loading && hasMore && profiles.length > 0 && (
          <Pressable
            style={styles.loadMoreBtn}
            onPress={() => fetchProfiles(false)}
            disabled={loadingMore}
          >
            {loadingMore ? (
              <ActivityIndicator size="small" color="#60a5fa" />
            ) : (
              <Text style={styles.loadMoreText}>Load More</Text>
            )}
          </Pressable>
        )}
      </SectionCard>

      {/* QR Scanner Modal */}
      <QRScannerModal
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onCodeScanned={handleQRResult}
      />
    </>
  );
}

const styles = StyleSheet.create({
  // Code input
  codeRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  codeInput: {
    flex: 1,
    backgroundColor: '#0f1628',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 3,
    borderWidth: 1,
    borderColor: '#25304c',
  },
  goBtn: {
    backgroundColor: '#e6b800',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  goBtnText: {
    color: '#111',
    fontSize: 15,
    fontWeight: '700',
  },
  qrBtn: {
    backgroundColor: '#1a2340',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#25304c',
    marginTop: 4,
  },
  qrBtnText: {
    color: '#60a5fa',
    fontSize: 14,
    fontWeight: '600',
  },
  codeError: {
    color: '#f87171',
    fontSize: 12,
    marginTop: 4,
  },
  // Filters
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  filterPill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#1a2340',
    borderWidth: 1,
    borderColor: '#25304c',
  },
  filterPillActive: {
    backgroundColor: '#e6b800',
    borderColor: '#e6b800',
  },
  filterText: {
    color: '#8090b0',
    fontSize: 12,
    fontWeight: '600',
  },
  filterTextActive: {
    color: '#111',
  },
  // Loading / error / empty
  center: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 10,
  },
  loadingText: {
    color: '#8090b0',
    fontSize: 14,
  },
  errorBox: {
    backgroundColor: '#2a1010',
    borderRadius: 8,
    padding: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#f87171',
  },
  errorText: {
    color: '#f87171',
    fontSize: 13,
  },
  emptyText: {
    color: '#8090b0',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    paddingVertical: 16,
  },
  // Profile cards
  profileCard: {
    backgroundColor: '#0f1628',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1a2340',
  },
  profileTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileInfo: {
    flex: 1,
  },
  profileDevice: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
  },
  profileName: {
    color: '#6b7fa0',
    fontSize: 12,
    marginTop: 1,
  },
  arrow: {
    color: '#e6b800',
    fontSize: 24,
    fontWeight: '700',
    marginLeft: 8,
  },
  profileBottom: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  profileStat: {
    color: '#4a5a7a',
    fontSize: 11,
  },
  downloadBadge: {
    color: '#60a5fa',
    fontSize: 11,
  },
  // Load more
  loadMoreBtn: {
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#25304c',
    marginTop: 4,
  },
  loadMoreText: {
    color: '#60a5fa',
    fontSize: 13,
    fontWeight: '600',
  },
});
