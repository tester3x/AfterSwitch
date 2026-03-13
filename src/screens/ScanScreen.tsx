import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '../components/PrimaryButton';
import { SectionCard } from '../components/SectionCard';
import { InfoRow } from '../components/InfoRow';
import type { DeviceProfile, ScanProgress } from '../types/profile';

type Props = {
  profile: DeviceProfile | null;
  scanning: boolean;
  scanProgress: ScanProgress | null;
  savedFileName: string | null;
  cloudSaving: boolean;
  cloudSaved: boolean;
  onExport: () => void;
};

type SettingsCategory = 'system' | 'secure' | 'global' | 'samsung' | 'apps' | 'defaults';

const SCAN_STEPS: Array<{ key: keyof ScanProgress; label: string }> = [
  { key: 'device', label: 'Device Info' },
  { key: 'system', label: 'System Settings' },
  { key: 'secure', label: 'Secure Settings' },
  { key: 'global', label: 'Global Settings' },
  { key: 'samsung', label: 'Samsung Settings' },
  { key: 'apps', label: 'Installed Apps' },
  { key: 'defaults', label: 'Default Apps' },
];

export function ScanScreen({ profile, scanning, scanProgress, savedFileName, cloudSaving, cloudSaved, onExport }: Props) {
  const [expandedCategory, setExpandedCategory] = useState<SettingsCategory | null>(null);

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

  const toggleCategory = (cat: SettingsCategory) => {
    setExpandedCategory((prev) => (prev === cat ? null : cat));
  };

  const getExpandedItems = (): Array<{ key: string; value: string }> => {
    if (!expandedCategory) return [];

    if (expandedCategory === 'apps') {
      return profile.apps.installed.map((app) => ({
        key: app.label || app.packageName,
        value: app.packageName,
      }));
    }

    if (expandedCategory === 'defaults') {
      return Object.entries(profile.defaults).map(([key, val]) => ({
        key: val ? val.label || val.packageName : '(none)',
        value: key,
      }));
    }

    const settings = profile.settings[expandedCategory];
    return Object.entries(settings).map(([key, value]) => ({
      key,
      value: String(value),
    }));
  };

  const expandedItems = getExpandedItems();
  const expandedLabel =
    expandedCategory === 'apps'
      ? 'Installed Apps'
      : expandedCategory === 'defaults'
        ? 'Default Apps'
        : expandedCategory
          ? expandedCategory.charAt(0).toUpperCase() + expandedCategory.slice(1) + ' Settings'
          : '';

  return (
    <>
      <SectionCard title="Scan Complete">
        <Text style={styles.tapHint}>Tap a category to see its contents</Text>
        <View style={styles.summaryGrid}>
          <SummaryItem count={systemCount} label="System" active={expandedCategory === 'system'} onPress={() => toggleCategory('system')} />
          <SummaryItem count={secureCount} label="Secure" active={expandedCategory === 'secure'} onPress={() => toggleCategory('secure')} />
          <SummaryItem count={globalCount} label="Global" active={expandedCategory === 'global'} onPress={() => toggleCategory('global')} />
          <SummaryItem count={samsungCount} label="Samsung" active={expandedCategory === 'samsung'} onPress={() => toggleCategory('samsung')} />
          <SummaryItem count={appCount} label="Apps" active={expandedCategory === 'apps'} onPress={() => toggleCategory('apps')} />
          <SummaryItem count={defaultsCount} label="Defaults" active={expandedCategory === 'defaults'} onPress={() => toggleCategory('defaults')} />
        </View>
        <Text style={styles.totalText}>
          {totalSettings} settings + {appCount} apps captured
        </Text>
        {savedFileName && (
          <View style={styles.savedFileBox}>
            <Text style={styles.savedFileLabel}>Saved as</Text>
            <Text style={styles.savedFileNameText}>{savedFileName}</Text>
          </View>
        )}
        {cloudSaving && (
          <View style={styles.cloudBox}>
            <ActivityIndicator size="small" color="#60a5fa" />
            <Text style={styles.cloudSavingText}>Saving to cloud...</Text>
          </View>
        )}
        {cloudSaved && !cloudSaving && (
          <View style={styles.cloudBox}>
            <Text style={styles.cloudCheckmark}>☁ ✓</Text>
            <Text style={styles.cloudSavedText}>Backed up to cloud</Text>
          </View>
        )}
      </SectionCard>

      {expandedCategory && expandedItems.length > 0 && (
        <SectionCard title={`${expandedLabel} (${expandedItems.length})`}>
          <Pressable onPress={() => setExpandedCategory(null)}>
            <Text style={styles.collapseHint}>Tap to close</Text>
          </Pressable>
          {expandedItems.map((item) => (
            <View key={item.key} style={styles.settingRow}>
              <Text style={styles.settingKey} numberOfLines={1}>{item.key}</Text>
              <Text style={styles.settingValue} numberOfLines={1}>{item.value}</Text>
            </View>
          ))}
        </SectionCard>
      )}

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

function SummaryItem({
  count,
  label,
  active,
  onPress,
}: {
  count: number;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.summaryItem, active && styles.summaryItemActive]}
      onPress={onPress}
    >
      <Text style={[styles.summaryCount, active && styles.summaryCountActive]}>{count}</Text>
      <Text style={[styles.summaryLabel, active && styles.summaryLabelActive]}>{label}</Text>
    </Pressable>
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
  tapHint: {
    color: '#4a5a7a',
    fontSize: 11,
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: 8,
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
    borderWidth: 1,
    borderColor: 'transparent',
  },
  summaryItemActive: {
    borderColor: '#e6b800',
  },
  summaryCount: {
    color: '#e6b800',
    fontSize: 22,
    fontWeight: '700',
  },
  summaryCountActive: {
    color: '#ffffff',
  },
  summaryLabel: {
    color: '#8090b0',
    fontSize: 11,
    marginTop: 2,
  },
  summaryLabelActive: {
    color: '#e6b800',
  },
  totalText: {
    color: '#6b7fa0',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
  savedFileBox: {
    backgroundColor: '#0f1628',
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#4ade80',
  },
  savedFileLabel: {
    color: '#6b7fa0',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  savedFileNameText: {
    color: '#4ade80',
    fontSize: 13,
    fontWeight: '600',
  },
  collapseHint: {
    color: '#6b7fa0',
    fontSize: 11,
    textAlign: 'center',
    marginBottom: 8,
    fontStyle: 'italic',
  },
  settingRow: {
    flexDirection: 'row',
    backgroundColor: '#0f1628',
    borderRadius: 6,
    padding: 8,
    gap: 8,
  },
  settingKey: {
    color: '#8090b0',
    fontSize: 11,
    flex: 1,
  },
  settingValue: {
    color: '#b7c1d6',
    fontSize: 11,
    flex: 1,
    textAlign: 'right',
  },
  cloudBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0f1628',
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#60a5fa',
  },
  cloudSavingText: {
    color: '#60a5fa',
    fontSize: 13,
    fontStyle: 'italic',
  },
  cloudCheckmark: {
    color: '#4ade80',
    fontSize: 16,
  },
  cloudSavedText: {
    color: '#4ade80',
    fontSize: 13,
    fontWeight: '600',
  },
  exportText: {
    color: '#b7c1d6',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
});
