import React, { useCallback, useMemo, useRef, useState } from 'react';
import { AppState, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
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
  type NativeWriteOutcome,
} from '../services/settingsReader';
import {
  isCompanionAvailable,
  writeSettingsViaCompanion,
  type CompanionStatus,
  type SettingToWrite,
  type WriteResultStatus,
} from '../services/companionBridge';
import {
  planRestore,
  type PlannedWrite,
  type WriteCapability,
} from '../services/restorePlan';

type Props = {
  comparison: ComparisonResult | null;
  currentProfile: DeviceProfile | null;
  importedProfile: DeviceProfile | null;
  onSelectCloudProfile: (profile: DeviceProfile) => void;
  onClearProfile: () => void;
  onRescan?: () => void;
};

/**
 * Outcome vocabulary. Every one of these is reachable, and none of them can
 * be produced by guessing: a write is either attempted and read-back
 * verified, or it is refused with the reason it was refused.
 */
type RestoreStatus =
  | 'pending'
  | 'restoring'
  /** Refused: the namespace/key pair is not on the allowlist. */
  | 'not_allowlisted'
  /** Refused: allowlisted, but the source value failed type/domain/length. */
  | 'unsupported_value'
  /** Refused: no row for this key in the imported profile. */
  | 'key_not_present'
  /** Refused: the permission for that namespace is not held. */
  | 'permission_missing'
  /** Attempted; the fresh read did not match. */
  | 'write_failed'
  /** Attempted; the fresh read matched. */
  | 'write_succeeded';

/** A status that will not change without another user action. */
function isTerminalStatus(s: RestoreStatus | undefined): boolean {
  return s === 'write_succeeded' || s === 'write_failed' ||
    s === 'not_allowlisted' || s === 'unsupported_value' ||
    s === 'key_not_present' || s === 'permission_missing';
}

// Persists collapse state across tab switches (component unmounts/remounts)
// null = cold open (use collapsed defaults), otherwise use last known state
let savedCollapseState: Record<string, boolean> | null = null;

export function RestoreScreen({ comparison, currentProfile, importedProfile, onSelectCloudProfile, onClearProfile, onRescan }: Props) {
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
  /** Restore All confirmation. Cancel/back/outside-tap are all no-ops. */
  const [confirmVisible, setConfirmVisible] = useState(false);
  /** Synchronous double-start latch; state alone updates too late. */
  const restoreStartedRef = useRef(false);
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

  /**
   * Which namespaces this build may write RIGHT NOW.
   *
   * The companion does NOT widen this. It used to: `secureAutoDiffs`
   * promoted every non-defaults guided diff to an automatic write whenever
   * the companion was connected or WRITE_SECURE_SETTINGS was held, which is
   * how unknown keys reached the write path. The companion is a transport
   * for writes the allowlist already approved, never a reason to approve
   * more of them.
   */
  const capability: WriteCapability = useMemo(() => ({
    system: companion.available || hasWriteSettings === true,
    secure: companion.available || hasSecureSettings === true,
    global: companion.available || hasSecureSettings === true,
  }), [companion.available, hasWriteSettings, hasSecureSettings]);

  /** Every difference the allowlist marks automatic, before selection. */
  const allRestorableDiffs = useMemo(() => {
    if (!comparison) return [];
    return comparison.settings.filter((d) => d.restoreType === 'auto' && !isJunkSetting(d.key));
  }, [comparison]);

  /** Differences kept for the record but never written. */
  const notRestorableDiffs = useMemo(() => {
    if (!comparison) return [];
    return comparison.settings.filter((d) => d.restoreType === 'info' && !isJunkSetting(d.key));
  }, [comparison]);

  /**
   * A single planned write, executed. The namespace decides the writer and
   * nothing retries in another one: a failed System write used to fall
   * through to Secure and then Global with the same key, which could create
   * a novel row in a namespace the key never belonged to.
   */
  const executeWrite = useCallback(async (write: PlannedWrite): Promise<RestoreStatus> => {
    // The native module speaks the same coarse vocabulary and enforces its
    // own copy of the allowlist, so a JS regression cannot widen what it
    // will write. Anything unrecognised is coerced to a failure, never a
    // success.
    let outcome: NativeWriteOutcome;
    if (write.namespace === 'system') {
      outcome = await writeSystemSetting(write.key, write.value);
    } else if (write.namespace === 'secure') {
      outcome = await writeSecureSetting(write.key, write.value);
    } else {
      outcome = await writeGlobalSetting(write.key, write.value);
    }
    return outcome;
  }, []);

  const handleRestoreSetting = useCallback(async (diff: SettingDiff) => {
    const plan = planRestore([diff], capability);
    const write = plan.writes[0];
    if (!write) {
      const reason = plan.excluded[0]?.reason;
      setRestoreStatuses((prev) => ({
        ...prev,
        [diff.key]:
          reason === 'permission_missing' ? 'permission_missing'
          : reason === 'missing_value' ? 'key_not_present'
          : reason === 'unsupported_value' ? 'unsupported_value'
          : 'not_allowlisted',
      }));
      return;
    }
    setRestoreStatuses((prev) => ({ ...prev, [diff.key]: 'restoring' }));
    const status = await executeWrite(write);
    setRestoreStatuses((prev) => ({ ...prev, [diff.key]: status }));
  }, [capability, executeWrite]);

  /**
   * The plan shown in the confirmation. Computed from the same filters the
   * restore itself uses, so the numbers cannot drift from what happens.
   */
  const restorePlan = useMemo(() => {
    const selected = allRestorableDiffs.filter(
      (d) => checkedSettings[d.key] && !isTerminalStatus(restoreStatuses[d.key]),
    );
    // The SAME planner the restore runs, so the confirmation numbers cannot
    // drift from what actually happens.
    const plan = planRestore(selected, capability);
    const guidedRemaining = comparison
      ? comparison.settings.filter(
          (d) =>
            d.restoreType === 'guided' &&
            !isJunkSetting(d.key) &&
            restoreStatuses[d.key] !== 'write_succeeded',
        )
      : [];
    return {
      automaticCount: plan.writes.length,
      guidedCount: guidedRemaining.length,
      skippedCount: plan.excluded.length,
      notRestorableCount: notRestorableDiffs.length,
    };
  }, [
    comparison, allRestorableDiffs, notRestorableDiffs, checkedSettings,
    restoreStatuses, capability,
  ]);

  /**
   * Opens the confirmation. Deliberately does NOT write anything — the only
   * path to a write is performRestoreAll, called from the Confirm button.
   * Restore All used to be wired straight to onPress with no confirmation
   * at all: one tap began a device-wide, non-undoable settings write.
   */
  const requestRestoreAll = useCallback(() => {
    if (!comparison || restoring) return;
    setConfirmVisible(true);
  }, [comparison, restoring]);

  const performRestoreAll = useCallback(async () => {
    if (!comparison || restoring) return;
    // Close first, then latch. Both guard against a second start: `restoring`
    // is the state guard, restoreStartedRef is the synchronous one — React
    // state updates are async, so two taps in the same tick would both see
    // restoring === false.
    setConfirmVisible(false);
    if (restoreStartedRef.current) return;
    restoreStartedRef.current = true;
    setRestoring(true);

    const selected = allRestorableDiffs.filter(
      (d) => checkedSettings[d.key] && !isTerminalStatus(restoreStatuses[d.key]),
    );

    // ONE planner, ONE decision point. Both transports execute exactly the
    // list it produces; neither may add to it. Everything the planner
    // refused is reported with its reason rather than silently dropped.
    const plan = planRestore(selected, capability);

    const refused: Record<string, RestoreStatus> = {};
    for (const e of plan.excluded) {
      refused[e.diffKey] =
        e.reason === 'permission_missing' ? 'permission_missing'
        : e.reason === 'missing_value' ? 'key_not_present'
        : e.reason === 'unsupported_value' ? 'unsupported_value'
        : 'not_allowlisted';
    }
    if (Object.keys(refused).length > 0) {
      setRestoreStatuses((prev) => ({ ...prev, ...refused }));
    }

    if (plan.writes.length > 0 && companion.available) {
      // ====== COMPANION PATH — transport only ======
      const marking: Record<string, RestoreStatus> = {};
      for (const w of plan.writes) marking[w.diffKey] = 'restoring';
      setRestoreStatuses((prev) => ({ ...prev, ...marking }));

      const settingsToWrite: SettingToWrite[] = plan.writes.map((w) => ({
        namespace: w.namespace,
        key: w.key,
        value: w.value,
      }));

      const result = await writeSettingsViaCompanion(settingsToWrite);

      const resultStatuses: Record<string, RestoreStatus> = {};
      for (let i = 0; i < plan.writes.length; i++) {
        const w = plan.writes[i];
        const r = result.results[i];
        // 'not_applicable' means the row did not exist before the write and
        // still does not. That is a key that is not present, not a success.
        resultStatuses[w.diffKey] = r?.success
          ? 'write_succeeded'
          : r?.status === 'not_applicable'
          ? 'key_not_present'
          : 'write_failed';
      }
      setRestoreStatuses((prev) => ({ ...prev, ...resultStatuses }));
    } else {
      // ====== NATIVE PATH ======
      for (const w of plan.writes) {
        setRestoreStatuses((prev) => ({ ...prev, [w.diffKey]: 'restoring' }));
        const status = await executeWrite(w);
        setRestoreStatuses((prev) => ({ ...prev, [w.diffKey]: status }));
      }
    }

    setRestoring(false);
    restoreStartedRef.current = false;

    // Re-scan device so comparison updates — restored settings drop out of diff list
    if (onRescan) {
      setTimeout(() => onRescan(), 500);
    }
  }, [comparison, allRestorableDiffs, checkedSettings, restoreStatuses, hasWriteSettings, hasSecureSettings, handleRestoreSetting, restoring, companion, onRescan]);

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

  // Display groups. The `secureAutoDiffs` promotion is GONE: guided means
  // guided, and no permission state can turn a guided difference into a
  // write. Everything automatic is already allowlisted.
  const autoDiffs = allRestorableDiffs;
  const guidedDiffs = comparison.settings.filter((d) => d.restoreType === 'guided' && !isJunkSetting(d.key));
  const blockedDiffs = autoDiffs.filter((d) => {
    if (companion.available) return false;
    if (d.category === 'system') return hasWriteSettings === false;
    return !hasSecureSettings;
  });
  const blockedByPermission = blockedDiffs.length;

  // Count stats — filter out already-attempted items (any terminal status)
  const isTerminal = isTerminalStatus;
  const successCount = Object.values(restoreStatuses).filter((s) => s === 'write_succeeded').length;
  const failedCount = Object.values(restoreStatuses).filter((s) => s === 'write_failed').length;
  const notApplicableCount = Object.values(restoreStatuses).filter(
    (s) => s === 'key_not_present' || s === 'not_allowlisted' || s === 'unsupported_value',
  ).length;
  const pendingRestorableCount = allRestorableDiffs.filter(
    (d) => checkedSettings[d.key] && !isTerminal(restoreStatuses[d.key])
  ).length;

  // Group auto diffs by SettingGroup, excluding already-attempted (any terminal status)
  const isAttempted = (d: SettingDiff) => isTerminal(restoreStatuses[d.key]);
  const autoGrouped = groupDiffsByGroup(
    autoDiffs.filter((d) => !isAttempted(d))
  );
  const guidedGrouped = groupDiffsByGroup(guidedDiffs.filter((d) => !isAttempted(d)));
  const notRestorableGrouped = groupDiffsByGroup(notRestorableDiffs);
  const visibleApps = comparison.apps; // Apps don't auto-remove

  // Remaining items that haven't been attempted
  const remainingAutoCount = autoDiffs.filter((d) => !isAttempted(d)).length;
  const remainingGuidedCount = guidedDiffs.filter((d) => !isAttempted(d)).length;

  const isCrossDevice = importedProfile && currentProfile &&
    importedProfile.device.model !== currentProfile.device.model;

  return (
    <>
      {/* Restore All confirmation.

          Cancel is the safe path and is the only styled-default action.
          onRequestClose (Android back) and the backdrop press both just
          close — neither begins a restore. Confirm is the sole route to
          performRestoreAll, and that function latches synchronously so a
          double-tap cannot start two concurrent restores. */}
      <Modal
        visible={confirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmVisible(false)}
      >
        <Pressable style={styles.confirmBackdrop} onPress={() => setConfirmVisible(false)}>
          {/* Stop taps inside the sheet from dismissing it. */}
          <Pressable style={styles.confirmSheet} onPress={() => {}}>
            <Text style={styles.confirmTitle}>Restore settings to this phone?</Text>

            <Text style={styles.confirmLine}>
              <Text style={styles.confirmNum}>{restorePlan.automaticCount}</Text>
              {' will be changed automatically'}
            </Text>
            <Text style={styles.confirmLine}>
              <Text style={styles.confirmNum}>{restorePlan.guidedCount}</Text>
              {' need you to change them by hand, guided step by step'}
            </Text>
            <Text style={styles.confirmLine}>
              <Text style={styles.confirmNum}>{restorePlan.skippedCount}</Text>
              {' will be skipped — this app cannot write them without extra permission'}
            </Text>

            <Text style={styles.confirmWarn}>
              Results vary by Android version and phone model, so some settings
              may not apply or may be overridden by the system.
            </Text>
            <Text style={styles.confirmWarn}>
              There is no full automatic undo yet. Save or export a profile of
              this phone first if you want a record of how it is now.
            </Text>

            <Pressable
              style={styles.confirmCancel}
              onPress={() => setConfirmVisible(false)}
            >
              <Text style={styles.confirmCancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.confirmGo, restoring && { opacity: 0.4 }]}
              disabled={restoring}
              onPress={performRestoreAll}
            >
              <Text style={styles.confirmGoText}>
                {restoring ? 'Restoring...' : `Restore ${restorePlan.automaticCount} settings`}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

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
        {!companion.available && pendingRestorableCount > 0 && failedCount === 0 && (
          <View style={styles.companionBox}>
            <Text style={styles.companionTitle}>Connect Companion for Best Results</Text>
            <Text style={styles.companionText}>
              Android restricts which settings apps can change directly. Connect via USB with the desktop companion to restore everything.
            </Text>
          </View>
        )}
        {pendingRestorableCount > 0 && (
          <PrimaryButton
            label={restoring ? 'Restoring...' : `Restore ${pendingRestorableCount} Checked Settings`}
            onPress={requestRestoreAll}
          />
        )}
        {pendingRestorableCount === 0 && (successCount > 0 || failedCount > 0 || notApplicableCount > 0) && (
          <>
            <Text style={styles.allDoneBanner}>
              {successCount > 0 && (failedCount > 0 || notApplicableCount > 0)
                ? `Done! ${successCount} restored${notApplicableCount > 0 ? `, ${notApplicableCount} skipped` : ''}${failedCount > 0 ? `, ${failedCount} couldn't be changed` : ''}.`
                : failedCount > 0
                ? `${failedCount} settings couldn't be changed on this device.`
                : 'All checked settings restored!'}
            </Text>
            <View style={styles.legendRow}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#4ade80' }]} />
                <Text style={styles.legendLabel}>Restored</Text>
              </View>
              {notApplicableCount > 0 && (
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#6b7280' }]} />
                  <Text style={styles.legendLabel}>Not on this device</Text>
                </View>
              )}
              {failedCount > 0 && (
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#f87171' }]} />
                  <Text style={styles.legendLabel}>System blocked</Text>
                </View>
              )}
            </View>
          </>
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

      {/* Saved, not restorable */}
      {/*
        The "Unlocked Restore" section used to live here. It rendered
        secureAutoDiffs -- every non-defaults GUIDED difference, promoted to
        an automatic write the moment the companion connected or
        WRITE_SECURE_SETTINGS was held. That promotion is how unknown keys
        reached the write path, so the section is gone rather than rewritten.
        What replaces it says the opposite thing: here is what we captured
        and are NOT going to write.
      */}
      {notRestorableGrouped.length > 0 && (
        <CollapsibleSectionCard
          title={`Saved, not restorable (${notRestorableDiffs.length})`}
          collapsed={sectionCollapsed['info'] ?? true}
          onToggle={() => toggleSection('info')}
        >
          <Text style={styles.sectionDescription}>
            These differences are kept in your profile and shown here, but this
            app will not write them. Either the setting is not on the reviewed
            allowlist, or it is one we deliberately never change automatically.
            Nothing here is claimed as restored.
          </Text>
          {notRestorableGrouped.map(({ group, diffs }) => (
            <CollapsibleGroup
              key={`info-${group}`}
              group={group}
              diffs={diffs}
              expanded={expandedGroups[`info-${group}`] ?? false}
              onToggleExpand={() => toggleGroup(`info-${group}`)}
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
              diffs={guidedDiffs.filter((d) => restoreStatuses[d.key] !== 'write_succeeded')}
              isSamsung={isSamsung}
              onComplete={() => setWizardActive(false)}
              onSettingVerified={(key) => {
                // The user changed it themselves in Settings and the wizard
                // re-read it. That is a verified restoration, not a write.
                setRestoreStatuses((prev) => ({ ...prev, [key]: 'write_succeeded' }));
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
  const restored = diffs.filter((d) => restoreStatuses[d.key] === 'write_succeeded');
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
  const skipped = diffs.filter((d) => {
    const s = restoreStatuses[d.key];
    return s === 'key_not_present' || s === 'not_allowlisted' || s === 'unsupported_value';
  });
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
  const failed = diffs.filter((d) => {
    const s = restoreStatuses[d.key];
    return s === 'write_failed' || s === 'permission_missing';
  });
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
  const failedCount = diffs.filter((d) => restoreStatuses[d.key] === 'write_failed').length;

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
    status === 'write_failed' ? '#f87171' : status === 'restoring' ? '#e6b800' : '#6b7fa0';

  return (
    <View style={[styles.restoreItem, !checked && styles.restoreItemUnchecked]}>
      <View style={styles.restoreHeader}>
        <Checkbox checked={checked} onToggle={onToggle} />
        <Text style={[styles.restoreLabel, !checked && styles.labelDimmed]} numberOfLines={1}>
          {diff.label}
        </Text>
        {status === 'write_failed' && (
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
  confirmBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', padding: 20 },
  confirmSheet: { backgroundColor: '#141922', borderRadius: 14, padding: 20, borderWidth: 1, borderColor: '#2a3245' },
  confirmTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 14 },
  confirmLine: { color: '#d7dbe3', fontSize: 14, lineHeight: 21, marginBottom: 6 },
  confirmNum: { color: '#e6b800', fontWeight: '700' },
  confirmWarn: { color: '#9aa2b1', fontSize: 12.5, lineHeight: 18, marginTop: 10 },
  confirmCancel: { marginTop: 18, paddingVertical: 13, borderRadius: 10, borderWidth: 1, borderColor: '#3a4257', alignItems: 'center' },
  confirmCancelText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  confirmGo: { marginTop: 10, paddingVertical: 13, borderRadius: 10, alignItems: 'center', backgroundColor: '#2a3245' },
  confirmGoText: { color: '#e6b800', fontSize: 15, fontWeight: '600' },
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
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    color: '#8090b0',
    fontSize: 12,
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
