import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SectionCard } from '../components/SectionCard';
import { CloudProfileList } from '../components/CloudProfileList';
import { GROUP_LABELS } from '../data/settingsRegistry';
import { groupDiffs } from '../services/profileCompare';
import type { ComparisonResult, DeviceProfile, SettingDiff, AppDiff, SettingGroup } from '../types/profile';

const COLLAPSED_KEY = 'compare_collapsed_groups';

type Props = {
  currentProfile: DeviceProfile | null;
  importedProfile: DeviceProfile | null;
  comparison: ComparisonResult | null;
  onSelectCloudProfile: (profile: DeviceProfile) => void;
  onClearProfile: () => void;
};

export function CompareScreen({ currentProfile, importedProfile, comparison, onSelectCloudProfile, onClearProfile }: Props) {
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);

  // Load persisted collapsed state
  useEffect(() => {
    AsyncStorage.getItem(COLLAPSED_KEY)
      .then((val) => {
        if (val) setCollapsedGroups(JSON.parse(val));
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  // Persist expanded state on change (default = collapsed, so we track which are expanded)
  const toggleGroup = useCallback((group: string) => {
    setCollapsedGroups((prev) => {
      // Default is collapsed (true). Toggle: if collapsed (true or undefined) → expand (false), if expanded (false) → collapse (true)
      const isCurrentlyCollapsed = prev[group] !== false;
      const next = { ...prev, [group]: isCurrentlyCollapsed ? false : true };
      AsyncStorage.setItem(COLLAPSED_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  if (!importedProfile || !comparison) {
    return (
      <>
        <SectionCard title="Pick a Profile to Compare">
          <Text style={styles.emptyText}>
            Select a saved profile to see what's different on this device.
          </Text>
        </SectionCard>

        <SectionCard title="Your Profiles">
          <CloudProfileList onSelect={onSelectCloudProfile} />
        </SectionCard>
      </>
    );
  }

  const grouped = groupDiffs(comparison.settings);
  const { summary } = comparison;

  return (
    <>
      <SectionCard title="Comparison Summary">
        <View style={styles.deviceRow}>
          <Text style={styles.deviceCompare}>
            {importedProfile.device.nickname} → {currentProfile?.device.nickname || 'This Phone'}
          </Text>
          <Pressable onPress={onClearProfile} style={styles.changeBtn}>
            <Text style={styles.changeBtnText}>Change</Text>
          </Pressable>
        </View>
        <Text style={styles.infoText}>
          Only showing settings that are different between the 2 devices.
        </Text>
        <View style={styles.summaryRow}>
          <SummaryBadge count={summary.totalDiffs} label="Total Diffs" color="#e6b800" />
          <SummaryBadge count={summary.autoRestoreCount} label="Auto-Fix" color="#4ade80" />
          <SummaryBadge count={summary.guidedCount} label="Guided" color="#60a5fa" />
          <SummaryBadge count={summary.missingApps} label="Missing Apps" color="#f87171" />
        </View>
      </SectionCard>

      {loaded && grouped.map(({ group, diffs }) => (
        <DiffGroup
          key={group}
          group={group}
          diffs={diffs}
          collapsed={collapsedGroups[group] !== false ? true : false}
          onToggle={() => toggleGroup(group)}
        />
      ))}

      {loaded && comparison.apps.length > 0 && (
        <DiffGroup
          key="__apps__"
          group={'apps' as SettingGroup}
          diffs={[]}
          apps={comparison.apps}
          collapsed={collapsedGroups['apps'] !== false ? true : false}
          onToggle={() => toggleGroup('apps')}
        />
      )}

      {summary.totalDiffs === 0 && (
        <SectionCard title="All Good!">
          <Text style={styles.emptyText}>
            Settings match your saved profile.
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

function DiffGroup({
  group,
  diffs,
  apps,
  collapsed,
  onToggle,
}: {
  group: SettingGroup;
  diffs: SettingDiff[];
  apps?: AppDiff[];
  collapsed: boolean;
  onToggle: () => void;
}) {
  const [itemsShown, setItemsShown] = useState(30);
  const isApps = !!apps && apps.length > 0;
  const items = isApps ? apps : diffs;
  const count = items.length;
  const title = isApps ? `Missing Apps (${count})` : `${GROUP_LABELS[group] || group} (${count})`;

  return (
    <View style={styles.groupCard}>
      <Pressable onPress={onToggle} style={styles.groupHeader}>
        <Text style={styles.groupTitle}>{title}</Text>
        <Text style={styles.chevron}>{collapsed ? '▸' : '▾'}</Text>
      </Pressable>
      {!collapsed && (
        <View style={styles.groupBody}>
          {isApps
            ? (apps as AppDiff[]).slice(0, itemsShown).map((app) => <AppDiffRow key={app.packageName} app={app} />)
            : diffs.slice(0, itemsShown).map((diff) => <DiffRow key={diff.key} diff={diff} />)}
          {itemsShown < count && (
            <Pressable
              style={styles.showMoreBtn}
              onPress={() => setItemsShown((prev) => prev + 30)}
            >
              <Text style={styles.showMoreText}>
                Show More ({count - itemsShown} remaining)
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

function DiffRow({ diff }: { diff: SettingDiff }) {
  const [showOld, setShowOld] = useState(false);

  const restoreColor =
    diff.restoreType === 'auto'
      ? '#4ade80'
      : diff.restoreType === 'guided'
        ? '#60a5fa'
        : '#6b7fa0';

  const displayValue = showOld ? diff.oldValue : diff.newValue;
  const displayColor = showOld ? '#f87171' : '#4ade80';
  const displayPrefix = showOld ? 'Old' : 'New';

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
        <Pressable onPress={() => setShowOld(!showOld)} style={styles.stateToggle}>
          <Text style={[styles.stateToggleLabel, { color: displayColor }]}>
            {displayPrefix}:
          </Text>
          <Text style={[styles.stateToggleValue, { color: displayColor }]} numberOfLines={1}>
            {displayValue}
          </Text>
          <Text style={styles.toggleArrow}>⇄</Text>
        </Pressable>
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
  deviceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  deviceCompare: {
    color: '#e6b800',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  changeBtn: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#6b7fa0',
  },
  changeBtnText: {
    color: '#6b7fa0',
    fontSize: 12,
    fontWeight: '600',
  },
  infoText: {
    color: '#6b7fa0',
    fontSize: 12,
    fontStyle: 'italic',
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
  groupCard: {
    backgroundColor: '#141b2d',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#25304c',
    overflow: 'hidden',
  },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
  },
  groupTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
  },
  chevron: {
    color: '#6b7fa0',
    fontSize: 18,
    paddingLeft: 8,
  },
  groupBody: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 8,
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
  },
  stateToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  stateToggleLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  stateToggleValue: {
    fontSize: 12,
    flex: 1,
  },
  toggleArrow: {
    color: '#6b7fa0',
    fontSize: 12,
    paddingLeft: 6,
  },
  oldValue: {
    color: '#f87171',
    fontSize: 12,
  },
  diffDescription: {
    color: '#6b7fa0',
    fontSize: 11,
    fontStyle: 'italic',
  },
  showMoreBtn: {
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#25304c',
  },
  showMoreText: {
    color: '#60a5fa',
    fontSize: 13,
    fontWeight: '600',
  },
});
