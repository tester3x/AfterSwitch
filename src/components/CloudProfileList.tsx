import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { listCloudProfiles, loadCloudProfile, deleteCloudProfile, type CloudProfileMeta } from '../services/cloudProfiles';
import type { DeviceProfile } from '../types/profile';

type Props = {
  onSelect: (profile: DeviceProfile) => void;
};

export function CloudProfileList({ onSelect }: Props) {
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
      setError(`Failed to load profiles: ${String(e)}`);
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
      onSelect(profile);
    } catch (e) {
      setError(`Failed to load profile: ${String(e)}`);
    } finally {
      setLoadingId(null);
    }
  }, [onSelect]);

  const handleDelete = useCallback((meta: CloudProfileMeta) => {
    Alert.alert(
      'Delete Profile',
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
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#e6b800" />
        <Text style={styles.loadingText}>Loading your profiles...</Text>
      </View>
    );
  }

  return (
    <View>
      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {profiles.length === 0 && !error && (
        <Text style={styles.emptyText}>
          No profiles saved yet. Go to the Home tab and scan your phone first.
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
            <Text style={styles.arrow}>›</Text>
          )}
        </TouchableOpacity>
      ))}

      {profiles.length > 0 && (
        <Text style={styles.hint}>
          Tap to select. Long-press to delete.
        </Text>
      )}

      <TouchableOpacity style={styles.refreshBtn} onPress={fetchProfiles} activeOpacity={0.7}>
        <Text style={styles.refreshText}>Refresh</Text>
      </TouchableOpacity>
    </View>
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
  arrow: {
    color: '#e6b800',
    fontSize: 24,
    fontWeight: '700',
    marginLeft: 8,
  },
  hint: {
    color: '#4a5a7a',
    fontSize: 11,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 8,
  },
  refreshBtn: {
    alignSelf: 'center',
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#25304c',
  },
  refreshText: {
    color: '#60a5fa',
    fontSize: 13,
    fontWeight: '600',
  },
});
