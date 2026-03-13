import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SectionCard } from '../components/SectionCard';
import { PrimaryButton } from '../components/PrimaryButton';
import { listCloudProfiles, loadCloudProfile, deleteCloudProfile, type CloudProfileMeta } from '../services/cloudProfiles';
import { saveProfileLocally } from '../services/profileIO';
import type { DeviceProfile } from '../types/profile';

type Props = {
  onSelect: (profile: DeviceProfile) => void;
  onBack: () => void;
};

export function CloudProfilesScreen({ onSelect, onBack }: Props) {
  const [profiles, setProfiles] = useState<CloudProfileMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listCloudProfiles();
      setProfiles(list);
    } catch (e) {
      setError(`Failed to load cloud profiles: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  const handleSelect = useCallback(async (meta: CloudProfileMeta) => {
    setLoadingId(meta.id);
    try {
      const profile = await loadCloudProfile(meta.id);
      if (!profile) {
        setError('Profile not found in cloud.');
        return;
      }
      // Save locally so it appears in the saved profiles list
      saveProfileLocally(profile);
      onSelect(profile);
    } catch (e) {
      setError(`Failed to load profile: ${String(e)}`);
    } finally {
      setLoadingId(null);
    }
  }, [onSelect]);

  const handleDelete = useCallback((meta: CloudProfileMeta) => {
    Alert.alert(
      'Delete Cloud Profile',
      `Remove "${meta.deviceName}" from the cloud? This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCloudProfile(meta.id);
              setProfiles((prev) => prev.filter((p) => p.id !== meta.id));
            } catch (e) {
              setError(`Delete failed: ${String(e)}`);
            }
          },
        },
      ]
    );
  }, []);

  if (loading) {
    return (
      <SectionCard title="Cloud Profiles">
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#e6b800" />
          <Text style={styles.loadingText}>Loading cloud profiles...</Text>
        </View>
      </SectionCard>
    );
  }

  return (
    <>
      <SectionCard title="Cloud Profiles">
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {profiles.length === 0 && !error && (
          <Text style={styles.emptyText}>
            No cloud profiles yet. Scan your phone and tap "Save to Cloud" on the Home tab.
          </Text>
        )}

        {profiles.map((meta) => (
          <TouchableOpacity
            key={meta.id}
            style={styles.profileRow}
            onPress={() => handleSelect(meta)}
            onLongPress={() => handleDelete(meta)}
            activeOpacity={0.7}
          >
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{meta.deviceName}</Text>
              <Text style={styles.profileMeta}>
                {meta.manufacturer} {meta.model} · {meta.settingsCount} settings · {meta.appsCount} apps
              </Text>
              <Text style={styles.profileDate}>
                {new Date(meta.savedAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </Text>
            </View>
            {loadingId === meta.id ? (
              <ActivityIndicator size="small" color="#e6b800" />
            ) : (
              <View style={styles.cloudBadge}>
                <Text style={styles.cloudBadgeText}>CLOUD</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}

        <Text style={styles.hint}>
          Tap to download and compare. Long-press to delete.
        </Text>
      </SectionCard>

      <View style={styles.actions}>
        <PrimaryButton label="Refresh" onPress={fetchProfiles} />
        <PrimaryButton label="Go Back" onPress={onBack} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 10,
  },
  loadingText: {
    color: '#8090b0',
    fontSize: 14,
  },
  emptyText: {
    color: '#8090b0',
    fontSize: 14,
    lineHeight: 20,
  },
  errorBox: {
    backgroundColor: '#2a1010',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#f87171',
  },
  errorText: {
    color: '#f87171',
    fontSize: 13,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a2340',
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  profileMeta: {
    color: '#8090b0',
    fontSize: 12,
    marginTop: 2,
  },
  profileDate: {
    color: '#6b7fa0',
    fontSize: 11,
    marginTop: 2,
  },
  cloudBadge: {
    backgroundColor: '#0f1628',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#60a5fa',
    marginLeft: 8,
  },
  cloudBadgeText: {
    color: '#60a5fa',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  hint: {
    color: '#4a5a7a',
    fontSize: 11,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 8,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
});
