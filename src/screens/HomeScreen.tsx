import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { PrimaryButton } from '../components/PrimaryButton';
import { SectionCard } from '../components/SectionCard';
import { InfoRow } from '../components/InfoRow';
import type { DeviceProfile } from '../types/profile';
import type { SavedProfileInfo } from '../services/profileIO';
import { isNativeModuleAvailable } from '../services/settingsReader';

type Props = {
  profile: DeviceProfile | null;
  lastScanTime: string | null;
  onScan: () => void;
  onImport: () => void;
  onSaveToCloud: () => void;
  onLoadFromCloud: () => void;
  cloudSaving: boolean;
  savedProfiles: SavedProfileInfo[];
  onSelectSavedProfile: (info: SavedProfileInfo) => void;
};

export function HomeScreen({
  profile,
  lastScanTime,
  onScan,
  onImport,
  onSaveToCloud,
  onLoadFromCloud,
  cloudSaving,
  savedProfiles,
  onSelectSavedProfile,
}: Props) {
  const hasNative = isNativeModuleAvailable();

  return (
    <>
      <SectionCard title="Scan This Phone">
        <Text style={styles.description}>
          Capture every setting on this device — display, keyboard, sound, navigation,
          accessibility, default apps, and Samsung-specific options.
        </Text>
        <PrimaryButton label="Scan Device Settings" onPress={onScan} />
        {lastScanTime && (
          <Text style={styles.lastScan}>
            Last scan: {new Date(lastScanTime).toLocaleString()}
          </Text>
        )}
        {!hasNative && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              SAMPLE MODE — Native module not available. Using demo data.
            </Text>
          </View>
        )}
      </SectionCard>

      {profile && (
        <SectionCard title="Device Info">
          <InfoRow label="Name" value={profile.device.nickname} />
          <InfoRow
            label="Device"
            value={`${profile.device.manufacturer} ${profile.device.model}`}
          />
          <InfoRow label="Android" value={`${profile.device.osVersion} (SDK ${profile.device.sdkInt})`} />
          {profile.device.oneUiVersion && (
            <InfoRow label="One UI" value={profile.device.oneUiVersion} />
          )}
          <View style={styles.countsRow}>
            <CountBadge
              count={Object.keys(profile.settings.system).length}
              label="System"
            />
            <CountBadge
              count={Object.keys(profile.settings.secure).length}
              label="Secure"
            />
            <CountBadge
              count={Object.keys(profile.settings.global).length}
              label="Global"
            />
            <CountBadge
              count={profile.apps.installed.length}
              label="Apps"
            />
          </View>
          <View style={styles.cloudRow}>
            <PrimaryButton
              label={cloudSaving ? 'Saving...' : 'Save to Cloud'}
              onPress={onSaveToCloud}
            />
          </View>
        </SectionCard>
      )}

      <SectionCard title="Restore a Profile">
        <Text style={styles.description}>
          Load a saved profile to compare and restore your settings — whether
          you switched phones, did a factory reset, or just need to undo changes.
        </Text>

        {/* Saved profiles list */}
        {savedProfiles.length > 0 && (
          <View style={styles.savedSection}>
            <Text style={styles.savedLabel}>Saved Profiles</Text>
            {savedProfiles.map((sp) => (
              <TouchableOpacity
                key={sp.filePath}
                style={styles.savedRow}
                onPress={() => onSelectSavedProfile(sp)}
                activeOpacity={0.7}
              >
                <View style={styles.savedInfo}>
                  <Text style={styles.savedName}>{sp.deviceName}</Text>
                  <Text style={styles.savedMeta}>
                    {sp.manufacturer ? sp.manufacturer + ' · ' : ''}
                    {sp.settingsCount} settings · {sp.appsCount} apps
                  </Text>
                  {sp.exportedAt ? (
                    <Text style={styles.savedDate}>
                      {new Date(sp.exportedAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </Text>
                  ) : null}
                </View>
                <Text style={styles.savedArrow}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.buttonRow}>
          <View style={styles.buttonCol}>
            <PrimaryButton label="Load from Cloud" onPress={onLoadFromCloud} />
          </View>
          <View style={styles.buttonCol}>
            <PrimaryButton label="Browse Files" onPress={onImport} />
          </View>
        </View>
      </SectionCard>
    </>
  );
}

function CountBadge({ count, label }: { count: number; label: string }) {
  return (
    <View style={styles.countBadge}>
      <Text style={styles.countNumber}>{count}</Text>
      <Text style={styles.countLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  description: {
    color: '#b7c1d6',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  lastScan: {
    color: '#6b7fa0',
    fontSize: 12,
    marginTop: 4,
  },
  badge: {
    backgroundColor: '#2a1a00',
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e6b800',
  },
  badgeText: {
    color: '#e6b800',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  countsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  countBadge: {
    flex: 1,
    backgroundColor: '#1a2340',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  countNumber: {
    color: '#e6b800',
    fontSize: 20,
    fontWeight: '700',
  },
  countLabel: {
    color: '#8090b0',
    fontSize: 11,
    marginTop: 2,
  },
  cloudRow: {
    marginTop: 10,
  },
  savedSection: {
    marginBottom: 10,
  },
  savedLabel: {
    color: '#8090b0',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a2340',
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
  },
  savedInfo: {
    flex: 1,
  },
  savedName: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  savedMeta: {
    color: '#8090b0',
    fontSize: 12,
    marginTop: 2,
  },
  savedDate: {
    color: '#6b7fa0',
    fontSize: 11,
    marginTop: 2,
  },
  savedArrow: {
    color: '#e6b800',
    fontSize: 24,
    fontWeight: '700',
    marginLeft: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  buttonCol: {
    flex: 1,
  },
});
