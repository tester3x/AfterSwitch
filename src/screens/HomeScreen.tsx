import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '../components/PrimaryButton';
import { SectionCard } from '../components/SectionCard';
import { InfoRow } from '../components/InfoRow';
import type { DeviceProfile } from '../types/profile';
import { isNativeModuleAvailable } from '../services/settingsReader';

type Props = {
  profile: DeviceProfile | null;
  lastScanTime: string | null;
  onScan: () => void;
  onExport: () => void;
  onShare: () => void;
  cloudSaving: boolean;
  userName: string | null;
  onSignOut: () => void;
};

export function HomeScreen({
  profile,
  lastScanTime,
  onScan,
  onExport,
  onShare,
  cloudSaving,
  userName,
  onSignOut,
}: Props) {
  const hasNative = isNativeModuleAvailable();

  return (
    <>
      {userName && (
        <SectionCard title="Account">
          <View style={styles.accountRow}>
            <Text style={styles.accountName}>{userName}</Text>
            <PrimaryButton label="Sign Out" onPress={onSignOut} />
          </View>
        </SectionCard>
      )}

      <SectionCard title="Scan This Phone">
        <Text style={styles.description}>
          Capture every setting on this device — display, keyboard, sound, navigation,
          accessibility, default apps, and Samsung-specific options.
        </Text>
        <PrimaryButton label="Scan Device Settings" onPress={onScan} />
        {cloudSaving && (
          <Text style={styles.cloudStatus}>Saving to cloud...</Text>
        )}
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
          <View style={styles.buttonRow}>
            <View style={styles.buttonHalf}>
              <PrimaryButton label="Export JSON" onPress={onExport} />
            </View>
            <Pressable style={styles.communityBtn} onPress={onShare}>
              <Text style={styles.communityBtnText}>Share to Community</Text>
            </Pressable>
          </View>
        </SectionCard>
      )}

      <SectionCard title="Compare & Restore">
        <Text style={styles.description}>
          Use the Compare tab to see differences, or the Restore tab to apply settings from
          your old phone. Your profiles are saved in the cloud automatically.
        </Text>
        <Text style={styles.hint}>
          Tip: Use the Browse tab to find shared profiles from other users,
          or enter a share code to load a friend's setup.
        </Text>
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
  cloudStatus: {
    color: '#60a5fa',
    fontSize: 12,
    marginTop: 4,
    fontStyle: 'italic',
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
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  buttonHalf: {
    flex: 1,
  },
  communityBtn: {
    flex: 1,
    backgroundColor: '#1a2340',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#60a5fa',
    justifyContent: 'center',
  },
  communityBtnText: {
    color: '#60a5fa',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  accountName: {
    color: '#b7c1d6',
    fontSize: 14,
    flex: 1,
  },
  hint: {
    color: '#4a5a7a',
    fontSize: 11,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 4,
  },
});
