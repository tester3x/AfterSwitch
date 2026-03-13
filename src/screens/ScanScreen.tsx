import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '../components/PrimaryButton';
import { SectionCard } from '../components/SectionCard';
import { InfoRow } from '../components/InfoRow';
import type { DeviceProfile, ScanProgress } from '../types/profile';

type Props = {
  profile: DeviceProfile | null;
  scanning: boolean;
  scanProgress: ScanProgress | null;
  onExport: () => void;
};

const SCAN_STEPS: Array<{ key: keyof ScanProgress; label: string }> = [
  { key: 'device', label: 'Device Info' },
  { key: 'system', label: 'System Settings' },
  { key: 'secure', label: 'Secure Settings' },
  { key: 'global', label: 'Global Settings' },
  { key: 'samsung', label: 'Samsung Settings' },
  { key: 'apps', label: 'Installed Apps' },
  { key: 'defaults', label: 'Default Apps' },
];

export function ScanScreen({ profile, scanning, scanProgress, onExport }: Props) {
  if (scanning && scanProgress) {
    return (
      <SectionCard title="Scanning Device...">
        {SCAN_STEPS.map((step) => (
          <View key={step.key} style={styles.stepRow}>
            {scanProgress[step.key] ? (
              <Text style={styles.checkmark}>✓</Text>
            ) : (
              <ActivityIndicator size="small" color="#e6b800" />
            )}
            <Text
              style={[
                styles.stepLabel,
                scanProgress[step.key] && styles.stepDone,
              ]}
            >
              {step.label}
            </Text>
          </View>
        ))}
      </SectionCard>
    );
  }

  if (!profile) {
    return (
      <SectionCard title="No Scan Yet">
        <Text style={styles.emptyText}>
          Go to the Home tab and tap "Scan Device Settings" to capture your phone's configuration.
        </Text>
      </SectionCard>
    );
  }

  const systemCount = Object.keys(profile.settings.system).length;
  const secureCount = Object.keys(profile.settings.secure).length;
  const globalCount = Object.keys(profile.settings.global).length;
  const samsungCount = Object.keys(profile.settings.samsung).length;
  const totalSettings = systemCount + secureCount + globalCount + samsungCount;
  const appCount = profile.apps.installed.length;
  const defaultsCount = Object.keys(profile.defaults).length;

  return (
    <>
      <SectionCard title="Scan Complete">
        <View style={styles.summaryGrid}>
          <SummaryItem count={systemCount} label="System" />
          <SummaryItem count={secureCount} label="Secure" />
          <SummaryItem count={globalCount} label="Global" />
          <SummaryItem count={samsungCount} label="Samsung" />
          <SummaryItem count={appCount} label="Apps" />
          <SummaryItem count={defaultsCount} label="Defaults" />
        </View>
        <Text style={styles.totalText}>
          {totalSettings} settings + {appCount} apps captured
        </Text>
      </SectionCard>

      <SectionCard title="Device" subtitle={profile.device.nickname}>
        <InfoRow label="Manufacturer" value={profile.device.manufacturer} />
        <InfoRow label="Model" value={profile.device.model} />
        <InfoRow label="Android" value={`${profile.device.osVersion} (SDK ${profile.device.sdkInt})`} />
        {profile.device.oneUiVersion && (
          <InfoRow label="One UI" value={profile.device.oneUiVersion} />
        )}
        <InfoRow label="Exported" value={new Date(profile.exportedAt).toLocaleString()} />
      </SectionCard>

      <SectionCard title="Export">
        <Text style={styles.exportText}>
          Save this profile to transfer to your new phone via Google Drive, email,
          Bluetooth, or any other sharing method.
        </Text>
        <PrimaryButton label="Export Profile JSON" onPress={onExport} />
      </SectionCard>
    </>
  );
}

function SummaryItem({ count, label }: { count: number; label: string }) {
  return (
    <View style={styles.summaryItem}>
      <Text style={styles.summaryCount}>{count}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 6,
  },
  checkmark: {
    color: '#4ade80',
    fontSize: 18,
    fontWeight: '700',
    width: 20,
    textAlign: 'center',
  },
  stepLabel: {
    color: '#b7c1d6',
    fontSize: 15,
  },
  stepDone: {
    color: 'white',
  },
  emptyText: {
    color: '#8090b0',
    fontSize: 14,
    lineHeight: 20,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  summaryItem: {
    width: '30%',
    backgroundColor: '#1a2340',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  summaryCount: {
    color: '#e6b800',
    fontSize: 22,
    fontWeight: '700',
  },
  summaryLabel: {
    color: '#8090b0',
    fontSize: 11,
    marginTop: 2,
  },
  totalText: {
    color: '#6b7fa0',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
  exportText: {
    color: '#b7c1d6',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
});
