import React, { useCallback, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SectionCard } from '../components/SectionCard';
import { CloudProfileList } from '../components/CloudProfileList';
import { PrimaryButton } from '../components/PrimaryButton';
import { GuidedWizard } from '../components/GuidedWizard';
import { GROUP_LABELS, GROUP_ORDER, isJunkSetting } from '../data/settingsRegistry';
import type { AppDiff, ComparisonResult, SettingDiff, SettingGroup } from '../types/profile';
import type { DeviceProfile } from '../types/profile';
import {
  canWriteSettings,
  canWriteSecureSettings,
  requestWritePermission,
  writeSystemSetting,
  writeSecureSetting,
  writeGlobalSetting,
  openSettingsScreen,
} from '../services/settingsReader';

type Props = {
  comparison: ComparisonResult | null;
  currentProfile: DeviceProfile | null;
  importedProfile: DeviceProfile | null;
  onSelectCloudProfile: (profile: DeviceProfile) => void;
  onClearProfile: () => void;
};

type RestoreStatus = 'pending' | 'restoring' | 'success' | 'failed';

export function RestoreScreen({ comparison, currentProfile, importedProfile, onSelectCloudProfile, onClearProfile }: Props) {
  const [restoreStatuses, setRestoreStatuses] = useState<Record<string, RestoreStatus>>({});
  const [hasWriteSettings, setHasWriteSettings] = useState<boolean | null>(null);
  const [hasSecureSettings, setHasSecureSettings] = useState<boolean | null>(null);
  const [checkedSettings, setCheckedSettings] = useState<Record<string, boolean>>({});
  const [checkedApps, setCheckedApps] = useState<Record<string, boolean>>({});
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [sectionCollapsed, setSectionCollapsed] = useState<Record<string, boolean>>({});
  const [restoring, setRestoring] = useState(false);
  const [wizardActive, setWizardActive] = useState(false);
  const [appsShown, setAppsShown] = useState(20);

  const isSamsung = useMemo(() => {
    return currentProfile?.device.manufacturer?.toLowerCase().includes('samsung') ?? false;
  }, [currentProfile]);

  React.useEffect(() => {
    (async () => {
      setHasWriteSettings(await canWriteSettings());
      setHasSecureSettings(await canWriteSecureSettings());
    })();
  }, []);

  React.useEffect(() => {
    if (!comparison) return;
    const settingsChecked: Record<string, boolean> = {};
    for (const diff of comparison.settings) {
      settingsChecked[diff.key] = true;
    }
    setCheckedSettings(settingsChecked);

    const appsChecked: Record<string, boolean> = {};
    for (const app of comparison.apps) {
      appsChecked[app.packageName] = true;
    }
    setCheckedApps(appsChecked);
    setRestoreStatuses({});
  }, [comparison]);

  const toggleSetting = useCallback((key: string) => {
    setCheckedSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const toggleApp = useCallback((packageName: string) => {
    setCheckedApps((prev) => ({ ...prev, [packageName]: !prev[packageName] }));
  }, []);

  const toggleGroup = useCallback((groupKey: string) => {
    setExpandedGroups((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }));
  }, []);

  const toggleSection = useCallback((key: string) => {
    setSectionCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleRequestWritePermission = useCallback(async () => {
    await requestWritePermission();
    setTimeout(async () => {
      setHasWriteSettings(await canWriteSettings());
    }, 2000);
  }, []);

  const handleRestoreSetting = useCallback(async (diff: SettingDiff) => {
    setRestoreStatuses((prev) => ({ ...prev, [diff.key]: 'restoring' }));

    try {
      const [category, ...keyParts] = diff.key.split('.');
      const rawKey = keyParts.join('.');
      // Always write the raw value, not the formatted display value
      const writeValue = diff.rawOldValue || diff.oldValue;
      let success = false;

      if (category === 'system') {
        success = await writeSystemSetting(rawKey, writeValue);
      } else if (category === 'secure') {
        success = await writeSecureSetting(rawKey, writeValue);
      } else if (category === 'global') {
        success = await writeGlobalSetting(rawKey, writeValue);
      } else if (category === 'samsung') {
        // Samsung settings exist across all three providers — try system first,
        // then secure (with WRITE_SECURE_SETTINGS), then global
        try {
          success = await writeSystemSetting(rawKey, writeValue);
        } catch {
          try {
            success = await writeSecureSetting(rawKey, writeValue);
          } catch {
            success = await writeGlobalSetting(rawKey, writeValue);
          }
        }
      }

      setRestoreStatuses((prev) => ({
        ...prev,
        [diff.key]: success ? 'success' : 'failed',
      }));
    } catch {
      setRestoreStatuses((prev) => ({ ...prev, [diff.key]: 'failed' }));
    }
  }, []);

  const handleRestoreAll = useCallback(async () => {
    if (!comparison || restoring) return;
    setRestoring(true);

    // Restore auto settings
    const autoToRestore = comparison.settings.filter(
      (d) =>
        d.restoreType === 'auto' &&
        checkedSettings[d.key] &&
        restoreStatuses[d.key] !== 'success'
    );

    // Also restore secure settings if we have permission
    const secureToRestore = hasSecureSettings
      ? comparison.settings.filter(
          (d) =>
            d.restoreType === 'guided' &&
            d.category !== 'defaults' &&
            checkedSettings[d.key] &&
            restoreStatuses[d.key] !== 'success'
        )
      : [];

    for (const diff of [...autoToRestore, ...secureToRestore]) {
      await handleRestoreSetting(diff);
    }

    setRestoring(false);
  }, [comparison, checkedSettings, restoreStatuses, hasSecureSettings, handleRestoreSetting, restoring]);

  const handleOpenSettings = useCallback(async (intent: string) => {
    await openSettingsScreen(intent);
  }, []);

  const handleInstallApp = useCallback((packageName: string) => {
    Linking.openURL(`market://details?id=${packageName}`).catch(() => {
      Linking.openURL(`https://play.google.com/store/apps/details?id=${packageName}`);
    });
  }, []);

  if (!comparison) {
    return (
      <>
        <SectionCard title="Load a Profile to Restore">
          <Text style={styles.emptyText}>
            Select a profile from the cloud to see what's different and restore settings.
          </Text>
        </SectionCard>

        <SectionCard title="Your Profiles">
          <CloudProfileList onSelect={onSelectCloudProfile} />
        </SectionCard>
      </>
    );
  }

  if (comparison.summary.totalDiffs === 0) {
    return (
      <SectionCard title="All Good!">
        <Text style={styles.emptyText}>
          No differences to restore. Your phones match!
        </Text>
      </SectionCard>
    );
  }

  // Split diffs by restore capability — filter junk settings that users can't find
  const autoDiffs = comparison.settings.filter((d) => d.restoreType === 'auto' && !isJunkSetting(d.key));
  const guidedDiffs = comparison.settings.filter((d) => d.restoreType === 'guided' && !isJunkSetting(d.key));
  const secureAutoDiffs = hasSecureSettings
    ? guidedDiffs.filter((d) => d.category !== 'defaults')
    : [];

  // All restorable diffs (auto + unlocked secure)
  const allRestorableDiffs = [...autoDiffs, ...secureAutoDiffs];

  // Count stats — filter out already-restored items
  const successCount = Object.values(restoreStatuses).filter((s) => s === 'success').length;
  const pendingRestorableCount = allRestorableDiffs.filter(
    (d) => checkedSettings[d.key] && restoreStatuses[d.key] !== 'success'
  ).length;

  // Group auto diffs by SettingGroup, excluding already-restored
  const autoGrouped = groupDiffsByGroup(
    autoDiffs.filter((d) => restoreStatuses[d.key] !== 'success')
  );
  const secureGrouped = groupDiffsByGroup(
    secureAutoDiffs.filter((d) => restoreStatuses[d.key] !== 'success')
  );
  const guidedGrouped = groupDiffsByGroup(
    (hasSecureSettings
      ? guidedDiffs.filter((d) => d.category === 'defaults')
      : guidedDiffs
    ).filter((d) => restoreStatuses[d.key] !== 'success')
  );
  const visibleApps = comparison.apps; // Apps don't auto-remove

  // Remaining items that haven't been restored
  const remainingAutoCount = autoDiffs.filter((d) => restoreStatuses[d.key] !== 'success').length;
  const remainingSecureCount = secureAutoDiffs.filter((d) => restoreStatuses[d.key] !== 'success').length;
  const remainingGuidedCount = (hasSecureSettings
    ? guidedDiffs.filter((d) => d.category === 'defaults')
    : guidedDiffs
  ).filter((d) => restoreStatuses[d.key] !== 'success').length;

  const isCrossDevice = importedProfile && currentProfile &&
    importedProfile.device.model !== currentProfile.device.model;

  return (
    <>
      {/* Source profile info */}
      {importedProfile && (
        <SectionCard title="Restore Source">
          <View style={styles.sourceRow}>
            <Text style={styles.sourceText}>
              Restoring from: {importedProfile.device.nickname}
            </Text>
            <Pressable onPress={onClearProfile} style={styles.changeSourceBtn}>
              <Text style={styles.changeSourceBtnText}>Change</Text>
            </Pressable>
          </View>
          {isCrossDevice && (
            <View style={styles.warningBox}>
              <Text style={styles.warningText}>
                These devices are different models ({importedProfile.device.model} → {currentProfile?.device.model}). Some settings may not apply or behave differently on this device.
              </Text>
            </View>
          )}
        </SectionCard>
      )}

      {/* Progress + Restore Button */}
      <SectionCard title="Restore Progress">
        {successCount > 0 && (
          <Text style={styles.successBanner}>
            {successCount} setting{successCount !== 1 ? 's' : ''} restored
          </Text>
        )}
        {pendingRestorableCount > 0 && (
          <PrimaryButton
            label={restoring ? 'Restoring...' : `Restore ${pendingRestorableCount} Checked Settings`}
            onPress={handleRestoreAll}
          />
        )}
        {pendingRestorableCount === 0 && successCount > 0 && (
          <Text style={styles.allDoneBanner}>All checked settings restored!</Text>
        )}
        {remainingGuidedCount > 0 && (
          <View style={styles.manualBox}>
            <Text style={styles.manualText}>
              {remainingGuidedCount} require{remainingGuidedCount === 1 ? 's' : ''} manual changes...
            </Text>
            <Pressable
              style={styles.wizardBtn}
              onPress={() => setWizardActive(true)}
            >
              <Text style={styles.wizardBtnText}>Run the wizard?</Text>
            </Pressable>
          </View>
        )}
      </SectionCard>

      {/* Permission prompt */}
      {hasWriteSettings === false && autoDiffs.length > 0 && (
        <SectionCard title="Permission Needed">
          <Text style={styles.permissionText}>
            AfterSwitch needs the "Modify System Settings" permission to auto-restore
            display, sound, and other system settings.
          </Text>
          <PrimaryButton label="Grant Permission" onPress={handleRequestWritePermission} />
        </SectionCard>
      )}

      {/* Auto-Restore groups */}
      {remainingAutoCount > 0 && (
        <CollapsibleSectionCard
          title={`Auto-Restore (${remainingAutoCount})`}
          collapsed={sectionCollapsed['auto'] ?? false}
          onToggle={() => toggleSection('auto')}
        >
          <Text style={styles.sectionDescription}>
            These settings can be applied automatically. Uncheck any you want to skip.
          </Text>
          {autoGrouped.map(({ group, diffs }) => (
            <CollapsibleGroup
              key={`auto-${group}`}
              group={group}
              diffs={diffs}
              expanded={expandedGroups[`auto-${group}`] ?? false}
              onToggleExpand={() => toggleGroup(`auto-${group}`)}
              checkedSettings={checkedSettings}
              restoreStatuses={restoreStatuses}
              onToggleSetting={toggleSetting}
              onOpenSettings={handleOpenSettings}
            />
          ))}
        </CollapsibleSectionCard>
      )}

      {/* Unlocked Restore groups */}
      {hasSecureSettings && remainingSecureCount > 0 && (
        <CollapsibleSectionCard
          title={`Unlocked Restore (${remainingSecureCount})`}
          collapsed={sectionCollapsed['secure'] ?? false}
          onToggle={() => toggleSection('secure')}
        >
          <Text style={styles.sectionDescription}>
            Desktop companion unlocked these. Uncheck any you want to skip.
          </Text>
          {secureGrouped.map(({ group, diffs }) => (
            <CollapsibleGroup
              key={`secure-${group}`}
              group={group}
              diffs={diffs}
              expanded={expandedGroups[`secure-${group}`] ?? false}
              onToggleExpand={() => toggleGroup(`secure-${group}`)}
              checkedSettings={checkedSettings}
              restoreStatuses={restoreStatuses}
              onToggleSetting={toggleSetting}
              onOpenSettings={handleOpenSettings}
            />
          ))}
        </CollapsibleSectionCard>
      )}

      {/* Guided Restore groups */}
      {remainingGuidedCount > 0 && (
        <CollapsibleSectionCard
          title={`Guided Restore (${remainingGuidedCount})`}
          collapsed={sectionCollapsed['guided'] ?? false}
          onToggle={() => toggleSection('guided')}
        >
          {wizardActive ? (
            <GuidedWizard
              diffs={(hasSecureSettings
                ? guidedDiffs.filter((d) => d.category === 'defaults')
                : guidedDiffs
              ).filter((d) => restoreStatuses[d.key] !== 'success')}
              isSamsung={isSamsung}
              onComplete={() => setWizardActive(false)}
              onSettingVerified={(key) => {
                setRestoreStatuses((prev) => ({ ...prev, [key]: 'success' }));
              }}
            />
          ) : (
            <>
              <Text style={styles.sectionDescription}>
                These need manual changes. The wizard walks you through each one.
              </Text>
              <PrimaryButton
                label={`Start Guided Restore (${remainingGuidedCount})`}
                onPress={() => setWizardActive(true)}
              />
              {guidedGrouped.map(({ group, diffs }) => (
                <CollapsibleGroup
                  key={`guided-${group}`}
                  group={group}
                  diffs={diffs}
                  expanded={expandedGroups[`guided-${group}`] ?? false}
                  onToggleExpand={() => toggleGroup(`guided-${group}`)}
                  checkedSettings={checkedSettings}
                  restoreStatuses={restoreStatuses}
                  onToggleSetting={toggleSetting}
                  onOpenSettings={handleOpenSettings}
                  guided
                />
              ))}
            </>
          )}
        </CollapsibleSectionCard>
      )}

      {/* Missing Apps */}
      {visibleApps.length > 0 && (
        <CollapsibleSectionCard
          title={`Missing Apps (${visibleApps.length})`}
          collapsed={sectionCollapsed['apps'] ?? false}
          onToggle={() => toggleSection('apps')}
        >
          <Text style={styles.sectionDescription}>
            Tap an app to open it in the Play Store.
          </Text>
          {visibleApps.slice(0, appsShown).map((app) => (
            <AppRestoreRow
              key={app.packageName}
              app={app}
              checked={checkedApps[app.packageName] ?? true}
              onToggle={() => toggleApp(app.packageName)}
              onInstall={() => handleInstallApp(app.packageName)}
            />
          ))}
          {appsShown < visibleApps.length && (
            <Pressable
              style={styles.showMoreBtn}
              onPress={() => setAppsShown((prev) => prev + 20)}
            >
              <Text style={styles.showMoreText}>
                Show More ({visibleApps.length - appsShown} remaining)
              </Text>
            </Pressable>
          )}
        </CollapsibleSectionCard>
      )}
    </>
  );
}

// ==================== Collapsible Section ====================

function CollapsibleSectionCard({
  title,
  collapsed,
  onToggle,
  children,
}: {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.sectionCard}>
      <Pressable onPress={onToggle} style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionChevron}>{collapsed ? '▸' : '▾'}</Text>
      </Pressable>
      {!collapsed && <View style={styles.sectionBody}>{children}</View>}
    </View>
  );
}

// ==================== Helpers ====================

type GroupedDiffs = { group: SettingGroup; diffs: SettingDiff[] };

function groupDiffsByGroup(diffs: SettingDiff[]): GroupedDiffs[] {
  const map = new Map<SettingGroup, SettingDiff[]>();
  for (const diff of diffs) {
    const existing = map.get(diff.group) || [];
    existing.push(diff);
    map.set(diff.group, existing);
  }

  return Array.from(map.entries())
    .map(([group, diffs]) => ({ group, diffs }))
    .sort((a, b) => (GROUP_ORDER[a.group] ?? 99) - (GROUP_ORDER[b.group] ?? 99));
}

// ==================== Components ====================

function CollapsibleGroup({
  group,
  diffs,
  expanded,
  onToggleExpand,
  checkedSettings,
  restoreStatuses,
  onToggleSetting,
  onOpenSettings,
  guided,
}: {
  group: SettingGroup;
  diffs: SettingDiff[];
  expanded: boolean;
  onToggleExpand: () => void;
  checkedSettings: Record<string, boolean>;
  restoreStatuses: Record<string, RestoreStatus>;
  onToggleSetting: (key: string) => void;
  onOpenSettings: (intent: string) => void;
  guided?: boolean;
}) {
  const checkedCount = diffs.filter((d) => checkedSettings[d.key]).length;
  const failedCount = diffs.filter((d) => restoreStatuses[d.key] === 'failed').length;

  return (
    <View style={styles.groupContainer}>
      <Pressable style={styles.groupHeader} onPress={onToggleExpand}>
        <Text style={styles.groupChevron}>{expanded ? '▼' : '▶'}</Text>
        <Text style={styles.groupLabel}>{GROUP_LABELS[group] || group}</Text>
        <Text style={styles.groupCount}>
          {checkedCount}/{diffs.length}
        </Text>
        {failedCount > 0 && (
          <Text style={styles.groupFailedBadge}>{failedCount} failed</Text>
        )}
      </Pressable>

      {expanded && (
        <View style={styles.groupItems}>
          {diffs.map((diff) => (
            <RestoreItem
              key={diff.key}
              diff={diff}
              status={restoreStatuses[diff.key] || 'pending'}
              checked={checkedSettings[diff.key] ?? true}
              onToggle={() => onToggleSetting(diff.key)}
              onOpenSettings={() =>
                diff.settingsIntent && onOpenSettings(diff.settingsIntent)
              }
              guided={guided}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function Checkbox({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  return (
    <Pressable style={[styles.checkbox, checked && styles.checkboxChecked]} onPress={onToggle}>
      {checked && <Text style={styles.checkmark}>✓</Text>}
    </Pressable>
  );
}

function RestoreItem({
  diff,
  status,
  checked,
  onToggle,
  onOpenSettings,
  guided,
}: {
  diff: SettingDiff;
  status: RestoreStatus;
  checked: boolean;
  onToggle: () => void;
  onOpenSettings: () => void;
  guided?: boolean;
}) {
  const statusColor =
    status === 'failed' ? '#f87171' : status === 'restoring' ? '#e6b800' : '#6b7fa0';

  return (
    <View style={[styles.restoreItem, !checked && styles.restoreItemUnchecked]}>
      <View style={styles.restoreHeader}>
        <Checkbox checked={checked} onToggle={onToggle} />
        <Text style={[styles.restoreLabel, !checked && styles.labelDimmed]} numberOfLines={1}>
          {diff.label}
        </Text>
        {status === 'failed' && (
          <Text style={[styles.statusIcon, { color: statusColor }]}>✗</Text>
        )}
        {status === 'restoring' && (
          <Text style={[styles.statusIcon, { color: statusColor }]}>...</Text>
        )}
      </View>
      {checked && (
        <>
          <View style={styles.restoreValues}>
            <Text style={styles.oldVal} numberOfLines={1}>
              Want: {diff.oldValue}
            </Text>
            <Text style={styles.newVal} numberOfLines={1}>
              Have: {diff.newValue}
            </Text>
          </View>
          {guided && diff.settingsIntent && (
            <View style={styles.restoreActions}>
              <Pressable style={styles.settingsBtn} onPress={onOpenSettings}>
                <Text style={styles.settingsBtnText}>Open Settings</Text>
              </Pressable>
            </View>
          )}
        </>
      )}
    </View>
  );
}

function AppRestoreRow({
  app,
  checked,
  onToggle,
  onInstall,
}: {
  app: AppDiff;
  checked: boolean;
  onToggle: () => void;
  onInstall: () => void;
}) {
  return (
    <View style={[styles.appRow, !checked && styles.restoreItemUnchecked]}>
      <Checkbox checked={checked} onToggle={onToggle} />
      <View style={styles.appInfo}>
        <Text style={[styles.appLabel, !checked && styles.labelDimmed]}>{app.label}</Text>
        <Text style={styles.appPackage}>{app.packageName}</Text>
      </View>
      {checked && (
        <Pressable style={styles.installBtn} onPress={onInstall}>
          <Text style={styles.installBtnText}>Install</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  emptyText: {
    color: '#8090b0',
    fontSize: 14,
    lineHeight: 20,
  },
  sourceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sourceText: {
    color: '#e6b800',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  changeSourceBtn: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#6b7fa0',
  },
  changeSourceBtnText: {
    color: '#6b7fa0',
    fontSize: 12,
    fontWeight: '600',
  },
  warningBox: {
    backgroundColor: '#2d2000',
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e6b800',
  },
  warningText: {
    color: '#e6b800',
    fontSize: 12,
    lineHeight: 18,
  },
  sectionCard: {
    backgroundColor: '#141b2d',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#25304c',
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
  },
  sectionTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
  },
  sectionChevron: {
    color: '#6b7fa0',
    fontSize: 18,
    paddingLeft: 8,
  },
  sectionBody: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 8,
  },
  successBanner: {
    color: '#4ade80',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  manualBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  manualText: {
    color: '#8090b0',
    fontSize: 13,
  },
  wizardBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e6b800',
  },
  wizardBtnText: {
    color: '#e6b800',
    fontSize: 13,
    fontWeight: '600',
  },
  allDoneBanner: {
    color: '#4ade80',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: 8,
  },
  permissionText: {
    color: '#b7c1d6',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  sectionDescription: {
    color: '#8090b0',
    fontSize: 12,
    marginBottom: 8,
  },
  // Collapsible group
  groupContainer: {
    backgroundColor: '#0f1628',
    borderRadius: 8,
    overflow: 'hidden',
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 8,
  },
  groupChevron: {
    color: '#e6b800',
    fontSize: 10,
    width: 14,
  },
  groupLabel: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  groupCount: {
    color: '#6b7fa0',
    fontSize: 12,
  },
  groupFailedBadge: {
    color: '#f87171',
    fontSize: 11,
    fontWeight: '600',
  },
  groupItems: {
    paddingHorizontal: 8,
    paddingBottom: 8,
    gap: 4,
  },
  // Checkbox
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#4a5568',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  checkboxChecked: {
    backgroundColor: '#4ade80',
    borderColor: '#4ade80',
  },
  checkmark: {
    color: '#0f1628',
    fontSize: 14,
    fontWeight: '700',
  },
  // Restore item
  restoreItem: {
    backgroundColor: '#111830',
    borderRadius: 6,
    padding: 8,
    gap: 4,
  },
  restoreItemUnchecked: {
    opacity: 0.5,
  },
  restoreHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  restoreLabel: {
    color: 'white',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  labelDimmed: {
    color: '#6b7fa0',
  },
  statusIcon: {
    fontSize: 16,
    fontWeight: '700',
  },
  restoreValues: {
    flexDirection: 'row',
    gap: 12,
    marginLeft: 30,
  },
  oldVal: {
    color: '#60a5fa',
    fontSize: 11,
    flex: 1,
  },
  newVal: {
    color: '#6b7fa0',
    fontSize: 11,
    flex: 1,
  },
  restoreActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
    marginLeft: 30,
  },
  settingsBtn: {
    backgroundColor: '#1a2340',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#25304c',
  },
  settingsBtnText: {
    color: '#60a5fa',
    fontSize: 12,
    fontWeight: '600',
  },
  // App rows
  appRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f1628',
    borderRadius: 8,
    padding: 10,
  },
  appInfo: {
    flex: 1,
    gap: 2,
  },
  appLabel: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  appPackage: {
    color: '#6b7fa0',
    fontSize: 11,
  },
  installBtn: {
    backgroundColor: '#1a2340',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#4ade80',
    marginLeft: 8,
  },
  installBtnText: {
    color: '#4ade80',
    fontSize: 12,
    fontWeight: '600',
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
