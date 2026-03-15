import React, { useCallback, useMemo, useRef, useState } from 'react';
import { AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
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
import {
  isCompanionAvailable,
  writeSettingsViaCompanion,
  type CompanionStatus,
  type SettingToWrite,
  type WriteResultStatus,
} from '../services/companionBridge';

type Props = {
  comparison: ComparisonResult | null;
  currentProfile: DeviceProfile | null;
  importedProfile: DeviceProfile | null;
  onSelectCloudProfile: (profile: DeviceProfile) => void;
  onClearProfile: () => void;
};

type RestoreStatus = 'pending' | 'restoring' | 'success' | 'failed' | 'not_applicable' | 'overridden';

// Persists collapse state across tab switches (component unmounts/remounts)
// null = cold open (use collapsed defaults), otherwise use last known state
let savedCollapseState: Record<string, boolean> | null = null;

export function RestoreScreen({ comparison, currentProfile, importedProfile, onSelectCloudProfile, onClearProfile }: Props) {
  const [restoreStatuses, setRestoreStatuses] = useState<Record<string, RestoreStatus>>({});
  const [hasWriteSettings, setHasWriteSettings] = useState<boolean | null>(null);
  const [hasSecureSettings, setHasSecureSettings] = useState<boolean | null>(null);
  const [checkedSettings, setCheckedSettings] = useState<Record<string, boolean>>({});
  const [checkedApps, setCheckedApps] = useState<Record<string, boolean>>({});
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [sectionCollapsed, setSectionCollapsed] = useState<Record<string, boolean>>(
    savedCollapseState ?? { auto: true, secure: true, guided: true, apps: true }
  );
  const [restoring, setRestoring] = useState(false);
  const [wizardActive, setWizardActive] = useState(false);
  const [appsShown, setAppsShown] = useState(20);
  const [companion, setCompanion] = useState<CompanionStatus>({ available: false });

  // Sync collapse state to module-level var so it survives tab switches
  React.useEffect(() => { savedCollapseState = sectionCollapsed; }, [sectionCollapsed]);

  const isSamsung = useMemo(() => {
    return currentProfile?.device.manufacturer?.toLowerCase().includes('samsung') ?? false;
  }, [currentProfile]);

  React.useEffect(() => {
    (async () => {
      setHasWriteSettings(await canWriteSettings());
      setHasSecureSettings(await canWriteSecureSettings());
      // Check if companion bridge is available (USB connected + companion running)
      const status = await isCompanionAvailable();
      setCompanion(status);
    })();
  }, []);

  // Re-check permissions and companion when user returns from Settings app
  const appState = useRef(AppState.currentState);
  React.useEffect(() => {
    const sub = AppState.addEventListener('change', async (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        setHasWriteSettings(await canWriteSettings());
        setHasSecureSettings(await canWriteSecureSettings());
        const status = await isCompanionAvailable();
        setCompanion(status);
      }
      appState.current = nextState;
    });
    return () => sub.remove();
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

  // Compute restorable diffs early (before callbacks that need it)
  const allRestorableDiffs = useMemo(() => {
    if (!comparison) return [];
    const allAutoDiffs = comparison.settings.filter((d) => d.restoreType === 'auto' && !isJunkSetting(d.key));
    const guidedDiffs = comparison.settings.filter((d) => d.restoreType === 'guided' && !isJunkSetting(d.key));
    const secureAutoDiffs = (companion.available || hasSecureSettings)
      ? guidedDiffs.filter((d) => d.category !== 'defaults')
      : [];
    const autoDiffs = companion.available
      ? allAutoDiffs
      : allAutoDiffs.filter((d) => {
          if (d.category === 'system' && hasWriteSettings === false) return false;
          if (d.category === 'secure' && !hasSecureSettings) return false;
          if (d.category === 'global' && !hasSecureSettings) return false;
          return true;
        });
    return [...autoDiffs, ...secureAutoDiffs];
  }, [comparison, companion.available, hasWriteSettings, hasSecureSettings]);

  const handleRestoreSettingLocal = useCallback(async (diff: SettingDiff): Promise<boolean> => {
    const [category, ...keyParts] = diff.key.split('.');
    const rawKey = keyParts.join('.');
    const writeValue = diff.rawOldValue || diff.oldValue;
    let success = false;

    if (category === 'system') {
      success = await writeSystemSetting(rawKey, writeValue);
      if (!success && hasSecureSettings) {
        success = await writeSecureSetting(rawKey, writeValue);
        if (!success) {
          success = await writeGlobalSetting(rawKey, writeValue);
        }
      }
    } else if (category === 'secure') {
      success = await writeSecureSetting(rawKey, writeValue);
    } else if (category === 'global') {
      success = await writeGlobalSetting(rawKey, writeValue);
    }

    return success;
  }, [hasSecureSettings]);

  const handleRestoreSetting = useCallback(async (diff: SettingDiff) => {
    setRestoreStatuses((prev) => ({ ...prev, [diff.key]: 'restoring' }));

    try {
      const success = await handleRestoreSettingLocal(diff);
      setRestoreStatuses((prev) => ({
        ...prev,
        [diff.key]: success ? 'success' : 'failed',
      }));
    } catch {
      setRestoreStatuses((prev) => ({ ...prev, [diff.key]: 'failed' }));
    }
  }, [handleRestoreSettingLocal]);

  const handleRestoreAll = useCallback(async () => {
    if (!comparison || restoring) return;
    setRestoring(true);

    // Only restore settings that match the displayed count (allRestorableDiffs)
    // This excludes junk settings and respects the same filters as the UI
    const allToRestore = allRestorableDiffs.filter(
      (d) =>
        checkedSettings[d.key] &&
        restoreStatuses[d.key] !== 'success' &&
        restoreStatuses[d.key] !== 'failed'
    );

    if (companion.available && allToRestore.length > 0) {
      // ====== COMPANION PATH ======
      // Send ALL settings to companion for ADB shell writes (shell privilege)
      // Mark all as restoring
      const newStatuses: Record<string, RestoreStatus> = {};
      for (const d of allToRestore) {
        newStatuses[d.key] = 'restoring';
      }
      setRestoreStatuses((prev) => ({ ...prev, ...newStatuses }));

      // Build the write list
      const settingsToWrite: SettingToWrite[] = allToRestore.map((d) => {
        const [category, ...keyParts] = d.key.split('.');
        return {
          namespace: category,
          key: keyParts.join('.'),
          value: d.rawOldValue || d.oldValue,
        };
      });

      const result = await writeSettingsViaCompanion(settingsToWrite);

      // Map results back to diff keys with rich status
      const resultStatuses: Record<string, RestoreStatus> = {};
      for (let i = 0; i < allToRestore.length; i++) {
        const diff = allToRestore[i];
        const writeResult = result.results[i];
        if (writeResult?.success) {
          resultStatuses[diff.key] = 'success';
        } else if (writeResult?.status === 'not_applicable') {
          resultStatuses[diff.key] = 'not_applicable';
        } else if (writeResult?.status === 'overridden') {
          resultStatuses[diff.key] = 'overridden';
        } else {
          resultStatuses[diff.key] = 'failed';
        }
      }
      setRestoreStatuses((prev) => ({ ...prev, ...resultStatuses }));
    } else {
      // ====== LOCAL PATH (no companion) ======
      // Only restore settings we have local permission to write
      const canWrite = (d: SettingDiff) => {
        if (d.category === 'system' && !hasWriteSettings) return false;
        if (d.category === 'secure' && !hasSecureSettings) return false;
        if (d.category === 'global' && !hasSecureSettings) return false;
        return true;
      };

      const localToRestore = allToRestore.filter(canWrite);

      for (const diff of localToRestore) {
        await handleRestoreSetting(diff);
      }
    }

    setRestoring(false);
  }, [comparison, allRestorableDiffs, checkedSettings, restoreStatuses, hasWriteSettings, hasSecureSettings, handleRestoreSetting, restoring, companion]);

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

  // Derive display groups from the memoized allRestorableDiffs
  const allAutoDiffs = comparison.settings.filter((d) => d.restoreType === 'auto' && !isJunkSetting(d.key));
  const guidedDiffs = comparison.settings.filter((d) => d.restoreType === 'guided' && !isJunkSetting(d.key));
  const secureAutoDiffs = (companion.available || hasSecureSettings)
    ? guidedDiffs.filter((d) => d.category !== 'defaults')
    : [];
  const autoDiffs = companion.available
    ? allAutoDiffs
    : allAutoDiffs.filter((d) => {
        if (d.category === 'system' && hasWriteSettings === false) return false;
        if (d.category === 'secure' && !hasSecureSettings) return false;
        if (d.category === 'global' && !hasSecureSettings) return false;
        return true;
      });
  const blockedDiffs = companion.available ? [] : allAutoDiffs.filter((d) => !autoDiffs.includes(d));
  const blockedByPermission = blockedDiffs.length;

  // Count stats — filter out already-attempted items (any terminal status)
  const isTerminal = (s: RestoreStatus) => s === 'success' || s === 'failed' || s === 'not_applicable' || s === 'overridden';
  const successCount = Object.values(restoreStatuses).filter((s) => s === 'success').length;
  const failedCount = Object.values(restoreStatuses).filter((s) => s === 'failed' || s === 'overridden').length;
  const notApplicableCount = Object.values(restoreStatuses).filter((s) => s === 'not_applicable').length;
  const pendingRestorableCount = allRestorableDiffs.filter(
    (d) => checkedSettings[d.key] && !isTerminal(restoreStatuses[d.key])
  ).length;

  // Group auto diffs by SettingGroup, excluding already-attempted (any terminal status)
  const isAttempted = (d: SettingDiff) => isTerminal(restoreStatuses[d.key]);
  const autoGrouped = groupDiffsByGroup(
    autoDiffs.filter((d) => !isAttempted(d))
  );
  const secureGrouped = groupDiffsByGroup(
    secureAutoDiffs.filter((d) => !isAttempted(d))
  );
  const guidedGrouped = groupDiffsByGroup(
    ((companion.available || hasSecureSettings)
      ? guidedDiffs.filter((d) => d.category === 'defaults')
      : guidedDiffs
    ).filter((d) => !isAttempted(d))
  );
  const visibleApps = comparison.apps; // Apps don't auto-remove

  // Remaining items that haven't been attempted
  const remainingAutoCount = autoDiffs.filter((d) => !isAttempted(d)).length;
  const remainingSecureCount = secureAutoDiffs.filter((d) => !isAttempted(d)).length;
  const remainingGuidedCount = ((companion.available || hasSecureSettings)
    ? guidedDiffs.filter((d) => d.category === 'defaults')
    : guidedDiffs
  ).filter((d) => !isAttempted(d)).length;

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
                Different device models ({importedProfile.device.model} → {currentProfile?.device.model}). Incompatible settings have been filtered out. Some remaining settings may behave differently.
              </Text>
            </View>
          )}
        </SectionCard>
      )}

      {/* Progress + Restore Button */}
      <SectionCard title="Restore Progress">
        {importedProfile && (
          <View style={styles.restoreFromRow}>
            <Text style={styles.restoreFromLabel}>Restoring from:</Text>
            <Text style={styles.restoreFromDevice}>
              {importedProfile.device.nickname}
            </Text>
          </View>
        )}
        {successCount > 0 && (
          <RestoredList
            diffs={comparison.settings}
            restoreStatuses={restoreStatuses}
          />
        )}
        {notApplicableCount > 0 && (
          <SkippedList
            diffs={comparison.settings}
            restoreStatuses={restoreStatuses}
          />
        )}
        {failedCount > 0 && (
          <FailedList
            diffs={comparison.settings}
            restoreStatuses={restoreStatuses}
            hasSecureSettings={hasSecureSettings}
          />
        )}
        {companion.available && (
          <View style={[styles.companionBox, { borderLeftColor: '#4ade80' }]}>
            <Text style={[styles.companionTitle, { color: '#4ade80' }]}>
              ● Companion Connected
            </Text>
            <Text style={styles.companionText}>
              All settings will be applied via USB — maximum compatibility.
            </Text>
          </View>
        )}
        {!companion.available && !hasSecureSettings && pendingRestorableCount > 0 && failedCount === 0 && (
          <View style={styles.companionBox}>
            <Text style={styles.companionTitle}>Companion App Recommended</Text>
            <Text style={styles.companionText}>
              Most settings need deeper access that Android restricts. Without the companion app, only a few basic settings can be restored. Connect via USB to unlock everything.
            </Text>
          </View>
        )}
        {pendingRestorableCount > 0 && (
          <PrimaryButton
            label={restoring ? 'Restoring...' : `Restore ${pendingRestorableCount} Checked Settings`}
            onPress={handleRestoreAll}
          />
        )}
        {pendingRestorableCount === 0 && (successCount > 0 || failedCount > 0 || notApplicableCount > 0) && (
          <Text style={styles.allDoneBanner}>
            {successCount > 0 && (failedCount > 0 || notApplicableCount > 0)
              ? `Done! ${successCount} restored${notApplicableCount > 0 ? `, ${notApplicableCount} skipped` : ''}${failedCount > 0 ? `, ${failedCount} couldn't be changed` : ''}.`
              : failedCount > 0
              ? `${failedCount} settings couldn't be changed on this device.`
              : 'All checked settings restored!'}
          </Text>
        )}
        {remainingGuidedCount > 0 && (
          <View style={styles.manualBox}>
            <Text style={styles.manualText}>
              {remainingGuidedCount} require{remainingGuidedCount === 1 ? 's' : ''} manual changes...
            </Text>
            <Pressable
              style={styles.wizardBtn}
              onPress={() => {
                setWizardActive(true);
                setSectionCollapsed((prev) => ({ ...prev, guided: false }));
              }}
            >
              <Text style={styles.wizardBtnText}>Run the wizard?</Text>
            </Pressable>
          </View>
        )}
      </SectionCard>

      {/* Permission prompt — show when settings are blocked */}
      {hasWriteSettings === false && blockedByPermission > 0 && (
        <SectionCard title="Permission Needed">
          <Text style={styles.permissionText}>
            {blockedByPermission} setting{blockedByPermission !== 1 ? 's' : ''} can't be restored without the "Modify System Settings" permission.
          </Text>
          <BlockedList diffs={blockedDiffs} />
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
      {(companion.available || hasSecureSettings) && remainingSecureCount > 0 && (
        <CollapsibleSectionCard
          title={`Unlocked Restore (${remainingSecureCount})`}
          collapsed={sectionCollapsed['secure'] ?? false}
          onToggle={() => toggleSection('secure')}
        >
          <Text style={styles.sectionDescription}>
            {companion.available
              ? 'Companion will apply these via USB. Uncheck any you want to skip.'
              : 'Desktop companion unlocked these. Uncheck any you want to skip.'}
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
              diffs={((companion.available || hasSecureSettings)
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

// ==================== Restored List ====================

function RestoredList({
  diffs,
  restoreStatuses,
}: {
  diffs: SettingDiff[];
  restoreStatuses: Record<string, RestoreStatus>;
}) {
  const [expanded, setExpanded] = useState(false);
  const restored = diffs.filter((d) => restoreStatuses[d.key] === 'success');
  if (restored.length === 0) return null;

  return (
    <View style={{ marginBottom: 8 }}>
      <Pressable onPress={() => setExpanded(!expanded)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={styles.successBanner}>
          {restored.length} setting{restored.length !== 1 ? 's' : ''} restored
        </Text>
        <Text style={{ color: '#4ade80', fontSize: 12 }}>{expanded ? '▾' : '▸'}</Text>
      </Pressable>
      {expanded && (
        <View style={{ gap: 2, marginTop: 4 }}>
          {restored.map((d) => (
            <Text key={d.key} style={{ color: '#4ade80', fontSize: 12, paddingLeft: 8 }}>
              {d.label}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

function SkippedList({
  diffs,
  restoreStatuses,
}: {
  diffs: SettingDiff[];
  restoreStatuses: Record<string, RestoreStatus>;
}) {
  const [expanded, setExpanded] = useState(false);
  const skipped = diffs.filter((d) => restoreStatuses[d.key] === 'not_applicable');
  if (skipped.length === 0) return null;

  return (
    <View style={{ marginBottom: 8 }}>
      <Pressable onPress={() => setExpanded(!expanded)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={{ color: '#6b7fa0', fontSize: 14, fontWeight: '600', marginBottom: 4 }}>
          {skipped.length} not on this device
        </Text>
        <Text style={{ color: '#6b7fa0', fontSize: 12, marginBottom: 4 }}>{expanded ? '▾' : '▸'}</Text>
      </Pressable>
      {!expanded && (
        <Text style={{ color: '#4a5568', fontSize: 11, marginTop: -2 }}>
          These settings don't exist on your phone — normal for different models.
        </Text>
      )}
      {expanded && (
        <View style={{ gap: 2, marginTop: 4 }}>
          {skipped.map((d) => (
            <Text key={d.key} style={{ color: '#6b7fa0', fontSize: 12, paddingLeft: 8 }}>
              {d.label}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

function FailedList({
  diffs,
  restoreStatuses,
  hasSecureSettings,
}: {
  diffs: SettingDiff[];
  restoreStatuses: Record<string, RestoreStatus>;
  hasSecureSettings: boolean | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const failed = diffs.filter((d) => restoreStatuses[d.key] === 'failed' || restoreStatuses[d.key] === 'overridden');
  if (failed.length === 0) return null;

  return (
    <View style={{ marginBottom: 8 }}>
      <Pressable onPress={() => setExpanded(!expanded)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={{ color: '#f87171', fontSize: 16, fontWeight: '700', marginBottom: 8 }}>
          {failed.length} setting{failed.length !== 1 ? 's' : ''}{' '}
          {hasSecureSettings ? "couldn't be changed" : 'need the companion app'}
        </Text>
        <Text style={{ color: '#f87171', fontSize: 12, marginBottom: 8 }}>{expanded ? '▾' : '▸'}</Text>
      </Pressable>
      {!expanded && (
        <Text style={{ color: '#6b7fa0', fontSize: 11, marginTop: -4 }}>
          {hasSecureSettings
            ? 'These settings may be protected or not supported on this device.'
            : 'Connect the desktop companion via USB to unlock these settings.'}
        </Text>
      )}
      {expanded && (
        <View style={{ gap: 2, marginTop: 4 }}>
          {failed.map((d) => (
            <Text key={d.key} style={{ color: '#f87171', fontSize: 12, paddingLeft: 8 }}>
              {d.label}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

function BlockedList({ diffs }: { diffs: SettingDiff[] }) {
  const [expanded, setExpanded] = useState(false);
  if (diffs.length === 0) return null;

  return (
    <View style={{ marginBottom: 8 }}>
      <Pressable onPress={() => setExpanded(!expanded)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={{ color: '#e6b800', fontSize: 12, fontWeight: '600' }}>
          See what's waiting {expanded ? '▾' : '▸'}
        </Text>
      </Pressable>
      {expanded && (
        <View style={{ gap: 2, marginTop: 4 }}>
          {diffs.map((d) => (
            <Text key={d.key} style={{ color: '#e6b800', fontSize: 12, paddingLeft: 8 }}>
              {d.label}
            </Text>
          ))}
        </View>
      )}
    </View>
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
  const [itemsShown, setItemsShown] = useState(30);
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
          {diffs.slice(0, itemsShown).map((diff) => (
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
          {itemsShown < diffs.length && (
            <Pressable
              style={styles.showMoreBtn}
              onPress={() => setItemsShown((prev) => prev + 30)}
            >
              <Text style={styles.showMoreText}>
                Show More ({diffs.length - itemsShown} remaining)
              </Text>
            </Pressable>
          )}
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
  restoreFromRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  restoreFromLabel: {
    color: '#6b7fa0',
    fontSize: 13,
  },
  restoreFromDevice: {
    color: '#e6b800',
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
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
  companionBox: {
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#60a5fa',
  },
  companionTitle: {
    color: '#60a5fa',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  companionText: {
    color: '#8090b0',
    fontSize: 12,
    lineHeight: 18,
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
