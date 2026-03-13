import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SectionCard } from '../components/SectionCard';
import { PrimaryButton } from '../components/PrimaryButton';
import { GROUP_LABELS } from '../data/settingsRegistry';
import { groupDiffs } from '../services/profileCompare';
import type { ComparisonResult, DeviceProfile, SettingDiff, AppDiff, SettingGroup } from '../types/profile';
import type { SavedProfileInfo } from '../services/profileIO';

type Props = {
  currentProfile: DeviceProfile | null;
  importedProfile: DeviceProfile | null;
  comparison: ComparisonResult | null;
  onImport: () => void;
  savedProfiles: SavedProfileInfo[];
  onSelectSavedProfile: (info: SavedProfileInfo) => void;
};

export function CompareScreen({ currentProfile, importedProfile, comparison, onImport, savedProfiles, onSelectSavedProfile }: Props) {
  if (!importedProfile || !comparison) {
    return (
      <>
        <SectionCard title="Pick a Profile to Compare">
          <Text style={styles.emptyText}>
            Select a saved profile to see what's different on this device.
          </Text>
        </SectionCard>

        {savedProfiles.length > 0 && (
          <SectionCard title="Saved Profiles">
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
          </SectionCard>
        )}

        <SectionCard title="Other Options">
          <PrimaryButton label="Browse Files" onPress={onImport} />
        </SectionCard>
      </>
    );
  }

  const grouped = groupDiffs(comparison.settings);
  const { summary } = comparison;

  return (
    <>
      <SectionCard title="Comparison Summary">
        <Text style={styles.deviceCompare}>
          {importedProfile.device.nickname} → {currentProfile?.device.nickname || 'This Phone'}
        </Text>
        <View style={styles.summaryRow}>
          <SummaryBadge count={summary.totalDiffs} label="Total Diffs" color="#e6b800" />
          <SummaryBadge count={summary.autoRestoreCount} label="Auto-Fix" color="#4ade80" />
          <SummaryBadge count={summary.guidedCount} label="Guided" color="#60a5fa" />
          <SummaryBadge count={summary.missingApps} label="Missing Apps" color="#f87171" />
        </View>
      </SectionCard>

      {grouped.map(({ group, diffs }) => (
        <DiffGroup key={group} group={group} diffs={diffs} />
      ))}

      {comparison.apps.length > 0 && (
        <SectionCard title={`Missing Apps (${comparison.apps.length})`}>
          {comparison.apps.map((app) => (
            <AppDiffRow key={app.packageName} app={app} />
          ))}
        </SectionCard>
      )}

      {summary.totalDiffs === 0 && (
        <SectionCard title="All Good!">
          <Text style={styles.emptyText}>
            No differences found. Your phones have matching settings.
          </Text>
        </SectionCard>
      )}
    </>
  );
}

function SummaryBadge({ count, label, color }: { count: number; label: string; color: string }) {
  return (
    <View style={[styles.summaryBadge, { borderColor: color }]}>
      <Text style={[styles.badgeCount, { color }]}>{count}</Text>
      <Text style={styles.badgeLabel}>{label}</Text>
    </View>
  );
}

function DiffGroup({ group, diffs }: { group: SettingGroup; diffs: SettingDiff[] }) {
  const [expanded, setExpanded] = useState(diffs.length <= 5);

  return (
    <SectionCard title={`${GROUP_LABELS[group] || group} (${diffs.length})`}>
      <Pressable onPress={() => setExpanded(!expanded)}>
        {!expanded && (
          <Text style={styles.expandHint}>Tap to {expanded ? 'collapse' : 'expand'}</Text>
        )}
      </Pressable>
      {expanded &&
        diffs.map((diff) => <DiffRow key={diff.key} diff={diff} />)}
    </SectionCard>
  );
}

function DiffRow({ diff }: { diff: SettingDiff }) {
  const restoreColor =
    diff.restoreType === 'auto'
      ? '#4ade80'
      : diff.restoreType === 'guided'
        ? '#60a5fa'
        : '#6b7fa0';

  return (
    <View style={styles.diffRow}>
      <View style={styles.diffHeader}>
        <Text style={styles.diffLabel} numberOfLines={1}>
          {diff.label}
        </Text>
        <Text style={[styles.restoreBadge, { color: restoreColor }]}>
          {diff.restoreType === 'auto' ? 'AUTO' : diff.restoreType === 'guided' ? 'GUIDED' : 'INFO'}
        </Text>
      </View>
      <View style={styles.diffValues}>
        <Text style={styles.oldValue} numberOfLines={1}>
          Old: {diff.oldValue}
        </Text>
        <Text style={styles.newValue} numberOfLines={1}>
          New: {diff.newValue}
        </Text>
      </View>
      {diff.description && (
        <Text style={styles.diffDescription}>{diff.description}</Text>
      )}
    </View>
  );
}

function AppDiffRow({ app }: { app: AppDiff }) {
  return (
    <View style={styles.diffRow}>
      <Text style={styles.diffLabel}>{app.label}</Text>
      <Text style={styles.oldValue}>{app.packageName}</Text>
      <Text style={[styles.restoreBadge, { color: '#f87171' }]}>
        {app.status === 'missing' ? 'MISSING' : 'VERSION MISMATCH'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  emptyText: {
    color: '#8090b0',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  deviceCompare: {
    color: '#e6b800',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  summaryBadge: {
    flex: 1,
    minWidth: 70,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  badgeCount: {
    fontSize: 18,
    fontWeight: '700',
  },
  badgeLabel: {
    color: '#8090b0',
    fontSize: 10,
    marginTop: 2,
  },
  expandHint: {
    color: '#6b7fa0',
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 4,
  },
  diffRow: {
    backgroundColor: '#0f1628',
    borderRadius: 8,
    padding: 10,
    gap: 4,
  },
  diffHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  diffLabel: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  restoreBadge: {
    fontSize: 10,
    fontWeight: '700',
  },
  diffValues: {
    flexDirection: 'row',
    gap: 12,
  },
  oldValue: {
    color: '#f87171',
    fontSize: 12,
    flex: 1,
  },
  newValue: {
    color: '#4ade80',
    fontSize: 12,
    flex: 1,
  },
  diffDescription: {
    color: '#6b7fa0',
    fontSize: 11,
    fontStyle: 'italic',
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
});
