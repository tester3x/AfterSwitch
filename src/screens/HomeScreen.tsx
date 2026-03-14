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
  profileSource: 'local' | 'cloud' | null;
  cloudHasProfile: boolean;
  onSaveToCloud: () => void;
  settingsMatch: boolean;
  quickChecking: boolean;
  diffCount: number;
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
  profileSource,
  cloudHasProfile,
  onSaveToCloud,
  settingsMatch,
  quickChecking,
  diffCount,
}: Props) {
  const hasNative = isNativeModuleAvailable();
  const scanDisabled = settingsMatch && !!profile && !quickChecking;

  return (
    <>
      {userName && (
        <View style={styles.accountBar}>
          <Text style={styles.accountName}>{userName}</Text>
          <Pressable onPress={onSignOut} style={styles.signOutBtn}>
            <Text style={styles.signOutText}>Sign Out</Text>
          </Pressable>
        </View>
      )}

      {/* Show saved profile immediately with source badge */}
      {profile && (
        <SectionCard title="Device Info">
          <View style={styles.badgeRow}>
            {/* Device badge — always show when profile exists */}
            <View style={styles.localBadge}>
              <Text style={styles.localBadgeIcon}>&#10003;</Text>
              <Text style={styles.localBadgeText}>Saved on Device</Text>
            </View>
            {/* Cloud badge — show status */}
            {cloudSaving ? (
              <View style={styles.cloudSavingBadge}>
                <Text style={styles.cloudSavingText}>Saving to Cloud...</Text>
              </View>
            ) : cloudHasProfile ? (
              <View style={styles.cloudBadge}>
                <Text style={styles.cloudBadgeIcon}>&#9729;</Text>
                <Text style={styles.cloudBadgeText}>Saved to Cloud</Text>
              </View>
            ) : (
              <Pressable style={styles.cloudPromptBadge} onPress={onSaveToCloud}>
                <Text style={styles.cloudPromptText}>Save to Cloud?</Text>
              </Pressable>
            )}
          </View>
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
            <CountBadge count={Object.keys(profile.settings.system).length} label="System" />
            <CountBadge count={Object.keys(profile.settings.secure).length} label="Secure" />
            <CountBadge count={Object.keys(profile.settings.global).length} label="Global" />
            <CountBadge count={profile.apps.installed.length} label="Apps" />
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

      <SectionCard title="Scan This Phone">
        {/* Smart scan status badges */}
        {quickChecking && (
          <View style={styles.checkingBadge}>
            <Text style={styles.checkingText}>Checking for changes...</Text>
          </View>
        )}
        {!quickChecking && settingsMatch && profile && (
          <View style={styles.matchBadge}>
            <Text style={styles.matchText}>&#10003; Settings match your saved profile</Text>
          </View>
        )}
        {!quickChecking && !settingsMatch && profile && diffCount > 0 && (
          <View style={styles.changedBadge}>
            <Text style={styles.changedText}>
              {diffCount} setting{diffCount !== 1 ? 's' : ''} changed since last scan
            </Text>
          </View>
        )}

        {!profile && (
          <Text style={styles.description}>
            Capture every setting on this device — display, keyboard, sound, navigation,
            accessibility, default apps, and Samsung-specific options.
          </Text>
        )}

        {scanDisabled ? (
          <View style={styles.scanDisabledBtn}>
            <Text style={styles.scanDisabledLabel}>Scan Device Settings</Text>
            <Text style={styles.scanDisabledHint}>No changes detected</Text>
          </View>
        ) : (
          <PrimaryButton
            label={profile ? 'Re-Scan Device Settings' : 'Scan Device Settings'}
            onPress={onScan}
          />
        )}

        {lastScanTime && (
          <Text style={styles.lastScan}>
            Last scan: {new Date(lastScanTime).toLocaleString()}
          </Text>
        )}
        {!hasNative && (
          <View style={styles.sampleBadge}>
            <Text style={styles.sampleBadgeText}>
              SAMPLE MODE — Native module not available. Using demo data.
            </Text>
          </View>
        )}
      </SectionCard>

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
  // Source badges (Device Info card)
  cloudBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0a1a2e',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#4ade80',
  },
  cloudBadgeIcon: {
    color: '#4ade80',
    fontSize: 14,
  },
  cloudBadgeText: {
    color: '#4ade80',
    fontSize: 12,
    fontWeight: '700',
  },
  localBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0a1a2e',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#4ade80',
  },
  localBadgeIcon: {
    color: '#4ade80',
    fontSize: 14,
  },
  localBadgeText: {
    color: '#4ade80',
    fontSize: 12,
    fontWeight: '700',
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  cloudSavingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a2340',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#e6b800',
  },
  cloudSavingText: {
    color: '#e6b800',
    fontSize: 12,
    fontWeight: '600',
    fontStyle: 'italic',
  },
  cloudPromptBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1400',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#f59e0b',
  },
  cloudPromptText: {
    color: '#f59e0b',
    fontSize: 12,
    fontWeight: '700',
  },
  // Quick check status badges (Scan card)
  checkingBadge: {
    backgroundColor: '#1a2340',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e6b800',
  },
  checkingText: {
    color: '#e6b800',
    fontSize: 12,
    fontWeight: '600',
    fontStyle: 'italic',
  },
  matchBadge: {
    backgroundColor: '#0a2016',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#4ade80',
  },
  matchText: {
    color: '#4ade80',
    fontSize: 12,
    fontWeight: '700',
  },
  changedBadge: {
    backgroundColor: '#2a1a00',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#f59e0b',
  },
  changedText: {
    color: '#f59e0b',
    fontSize: 12,
    fontWeight: '700',
  },
  // Greyed out scan button
  scanDisabledBtn: {
    backgroundColor: '#1a2340',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    opacity: 0.5,
  },
  scanDisabledLabel: {
    color: '#6b7fa0',
    fontSize: 15,
    fontWeight: '700',
  },
  scanDisabledHint: {
    color: '#4a5a7a',
    fontSize: 11,
    marginTop: 2,
  },
  // Sample mode badge
  sampleBadge: {
    backgroundColor: '#2a1a00',
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e6b800',
  },
  sampleBadgeText: {
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
  accountBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  accountName: {
    color: '#6b7a9a',
    fontSize: 12,
  },
  signOutBtn: {
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  signOutText: {
    color: '#6b7a9a',
    fontSize: 12,
  },
  hint: {
    color: '#4a5a7a',
    fontSize: 11,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 4,
  },
});
