import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SectionCard } from '../components/SectionCard';
import { PrimaryButton } from '../components/PrimaryButton';
import {
  listCloudProfiles,
  loadCloudProfile,
  deleteCloudProfile,
  type CloudProfileMeta,
} from '../services/cloudProfiles';
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
      setError(`Failed to load profiles: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  const handleSelect = useCallback(
    async (meta: CloudProfileMeta) => {
      setLoadingId(meta.id);
      try {
        const profile = await loadCloudProfile(meta.id);
        if (profile) {
          onSelect(profile);
        } else {
          setError('Profile not found in cloud.');
        }
      } catch (e) {
        setError(`Failed to load profile: ${String(e)}`);
      } finally {
        setLoadingId(null);
      }
    },
    [onSelect]
  );

  const handleDelete = useCallback(
    async (meta: CloudProfileMeta) => {
      try {
        await deleteCloudProfile(meta.id);
        setProfiles((prev) => prev.filter((p) => p.id !== meta.id));
      } catch (e) {
        setError(`Failed to delete: ${String(e)}`);
      }
    },
    []
  );

  return (
    <>
      <SectionCard title="Cloud Profiles">
        <PrimaryButton label="Back" onPress={onBack} />
      </SectionCard>

      {loading && (
        <SectionCard title="Loading...">
          <Text style={styles.loadingText}>Fetching your saved profiles...</Text>
        </SectionCard>
      )}

      {error && (
        <SectionCard title="Error">
          <Text style={styles.errorText}>{error}</Text>
          <PrimaryButton label="Retry" onPress={fetchProfiles} />
        </SectionCard>
      )}

      {!loading && !error && profiles.length === 0 && (
        <SectionCard title="No Profiles">
          <Text style={styles.emptyText}>
            No saved profiles found. Scan your phone and tap "Save to Cloud" to
            back up your settings.
          </Text>
        </SectionCard>
      )}

      {profiles.map((meta) => (
        <SectionCard key={meta.id} title={meta.deviceName}>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>{meta.manufacturer} {meta.model}</Text>
            <Text style={styles.metaDate}>
              {new Date(meta.savedAt).toLocaleDateString()}
            </Text>
          </View>
          <Text style={styles.metaCounts}>
            {meta.settingsCount} settings + {meta.appsCount} apps
          </Text>
          <View style={styles.actions}>
            <Pressable
              style={styles.selectBtn}
              onPress={() => handleSelect(meta)}
            >
              <Text style={styles.selectBtnText}>
                {loadingId === meta.id ? 'Loading...' : 'Use This Profile'}
              </Text>
            </Pressable>
            <Pressable
              style={styles.deleteBtn}
              onPress={() => handleDelete(meta)}
            >
              <Text style={styles.deleteBtnText}>Delete</Text>
            </Pressable>
          </View>
        </SectionCard>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  loadingText: {
    color: '#8090b0',
    fontSize: 14,
  },
  errorText: {
    color: '#f87171',
    fontSize: 13,
    marginBottom: 8,
  },
  emptyText: {
    color: '#8090b0',
    fontSize: 14,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaLabel: {
    color: '#b7c1d6',
    fontSize: 13,
  },
  metaDate: {
    color: '#6b7fa0',
    fontSize: 12,
  },
  metaCounts: {
    color: '#e6b800',
    fontSize: 12,
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  selectBtn: {
    flex: 1,
    backgroundColor: '#4ade80',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  selectBtnText: {
    color: '#0f1628',
    fontSize: 14,
    fontWeight: '700',
  },
  deleteBtn: {
    backgroundColor: '#1a2340',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f87171',
  },
  deleteBtnText: {
    color: '#f87171',
    fontSize: 13,
    fontWeight: '600',
  },
});
