import React, { useCallback, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SectionCard } from '../components/SectionCard';
import { PrimaryButton } from '../components/PrimaryButton';
import { GROUP_LABELS } from '../data/settingsRegistry';
import type { AppDiff, ComparisonResult, SettingDiff } from '../types/profile';
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
};

type RestoreStatus = 'pending' | 'restoring' | 'success' | 'failed';

export function RestoreScreen({ comparison }: Props) {
  const [restoreStatuses, setRestoreStatuses] = useState<Record<string, RestoreStatus>>({});
  const [hasWriteSettings, setHasWriteSettings] = useState<boolean | null>(null);
  const [hasSecureSettings, setHasSecureSettings] = useState<boolean | null>(null);
  // Checked state for settings and apps (default: all checked)
  const [checkedSettings, setCheckedSettings] = useState<Record<string, boolean>>({});
  const [checkedApps, setCheckedApps] = useState<Record<string, boolean>>({});

  // Check permissions on first render
  React.useEffect(() => {
    (async () => {
      setHasWriteSettings(await canWriteSettings());
      setHasSecureSettings(await canWriteSecureSettings());
    })();
  }, []);

  // Initialize checked state when comparison changes
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
  }, [comparison]);

  const toggleSetting = useCallback((key: string) => {
    setCheckedSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const toggleApp = useCallback((packageName: string) => {
    setCheckedApps((prev) => ({ ...prev, [packageName]: !prev[packageName] }));
  }, []);

  const toggleAllSettings = useCallback((diffs: SettingDiff[], checked: boolean) => {
    setCheckedSettings((prev) => {
      const next = { ...prev };
      for (const diff of diffs) {
        next[diff.key] = checked;
      }
      return next;
    });
  }, []);

  const toggleAllApps = useCallback((checked: boolean) => {
    setCheckedApps((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        next[key] = checked;
      }
      return next;
    });
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
      let success = false;

      if (category === 'system') {
        success = await writeSystemSetting(rawKey, diff.oldValue);
      } else if (category === 'secure') {
        success = await writeSecureSetting(rawKey, diff.oldValue);
      } else if (category === 'global') {
        success = await writeGlobalSetting(rawKey, diff.oldValue);
      }

      setRestoreStatuses((prev) => ({
        ...prev,
        [diff.key]: success ? 'success' : 'failed',
      }));
    } catch {
      setRestoreStatuses((prev) => ({ ...prev, [diff.key]: 'failed' }));
    }
  }, []);

  const handleRestoreChecked = useCallback(async (diffs: SettingDiff[]) => {
    const toRestore = diffs.filter(
      (d) => checkedSettings[d.key] && restoreStatuses[d.key] !== 'success'
    );
    for (const diff of toRestore) {
      await handleRestoreSetting(diff);
    }
  }, [checkedSettings, restoreStatuses, handleRestoreSetting]);

  const handleOpenSettings = useCallback(async (intent: string) => {
    await openSettingsScreen(intent);
  }, []);

  const handleInstallApp = useCallback((packageName: string) => {
    Linking.openURL(`market://details?id=${packageName}`).catch(() => {
      Linking.openURL(`https://play.google.com/store/apps/details?id=${packageName}`);
    });
  }, []);

  if (!comparison || comparison.summary.totalDiffs === 0) {
    return (
      <SectionCard title="Restore">
        <Text style={styles.emptyText}>
          {!comparison
            ? 'Import a profile and compare settings first.'
            : 'No differences to restore. Your phones match!'}
        </Text>
      </SectionCard>
    );
  }

  // Split diffs by restore type
  const autoDiffs = comparison.settings.filter((d) => d.restoreType === 'auto');
  const guidedDiffs = comparison.settings.filter((d) => d.restoreType === 'guided');
  const secureAutoDiffs = hasSecureSettings
    ? comparison.settings.filter((d) => d.restoreType === 'guided' && d.category !== 'defaults')
    : [];

  const restoredCount = Object.values(restoreStatuses).filter((s) => s === 'success').length;
  const checkedSettingsCount = Object.values(checkedSettings).filter(Boolean).length;
  const checkedAppsCount = Object.values(checkedApps).filter(Boolean).length;

  return (
    <>
      {/* Progress */}
      <SectionCard title="Restore Progress">
        <Text style={styles.progressText}>
          {restoredCount} / {checkedSettingsCount + checkedAppsCount} selected items
        </Text>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${
                  checkedSettingsCount + checkedAppsCount > 0
                    ? (restoredCount / (checkedSettingsCount + checkedAppsCount)) * 100
                    : 0
                }%`,
              },
            ]}
          />
        </View>
      </SectionCard>

      {/* Permission check */}
      {hasWriteSettings === false && autoDiffs.length > 0 && (
        <SectionCard title="Permission Needed">
          <Text style={styles.permissionText}>
            AfterSwitch needs the "Modify System Settings" permission to auto-restore
            display, sound, and other system settings.
          </Text>
          <PrimaryButton label="Grant Permission" onPress={handleRequestWritePermission} />
        </SectionCard>
      )}

      {/* Auto-restore section */}
      {autoDiffs.length > 0 && (
        <SectionCard title={`Auto-Restore (${autoDiffs.length})`}>
          <Text style={styles.sectionDescription}>
            These settings can be applied automatically. Uncheck any you want to skip.
          </Text>
          <View style={styles.selectRow}>
            <Pressable onPress={() => toggleAllSettings(autoDiffs, true)}>
              <Text style={styles.selectAllText}>Select All</Text>
            </Pressable>
            <Pressable onPress={() => toggleAllSettings(autoDiffs, false)}>
              <Text style={styles.selectNoneText}>Select None</Text>
            </Pressable>
          </View>
          <PrimaryButton
            label={`Restore ${autoDiffs.filter((d) => checkedSettings[d.key]).length} Checked`}
            onPress={() => handleRestoreChecked(autoDiffs)}
          />
          {autoDiffs.map((diff) => (
            <RestoreItem
              key={diff.key}
              diff={diff}
              status={restoreStatuses[diff.key] || 'pending'}
              checked={checkedSettings[diff.key] ?? true}
              onToggle={() => toggleSetting(diff.key)}
              onRestore={() => handleRestoreSetting(diff)}
              onOpenSettings={() =>
                diff.settingsIntent && handleOpenSettings(diff.settingsIntent)
              }
            />
          ))}
        </SectionCard>
      )}

      {/* Secure auto-restore (only if WRITE_SECURE_SETTINGS granted) */}
      {hasSecureSettings && secureAutoDiffs.length > 0 && (
        <SectionCard title={`Unlocked Restore (${secureAutoDiffs.length})`}>
          <Text style={styles.sectionDescription}>
            Desktop companion unlocked these. Uncheck any you want to skip.
          </Text>
          <View style={styles.selectRow}>
            <Pressable onPress={() => toggleAllSettings(secureAutoDiffs, true)}>
              <Text style={styles.selectAllText}>Select All</Text>
            </Pressable>
            <Pressable onPress={() => toggleAllSettings(secureAutoDiffs, false)}>
              <Text style={styles.selectNoneText}>Select None</Text>
            </Pressable>
          </View>
          <PrimaryButton
            label={`Restore ${secureAutoDiffs.filter((d) => checkedSettings[d.key]).length} Checked`}
            onPress={() => handleRestoreChecked(secureAutoDiffs)}
          />
          {secureAutoDiffs.map((diff) => (
            <RestoreItem
              key={diff.key}
              diff={diff}
              status={restoreStatuses[diff.key] || 'pending'}
              checked={checkedSettings[diff.key] ?? true}
              onToggle={() => toggleSetting(diff.key)}
              onRestore={() => handleRestoreSetting(diff)}
              onOpenSettings={() =>
                diff.settingsIntent && handleOpenSettings(diff.settingsIntent)
              }
            />
          ))}
        </SectionCard>
      )}

      {/* Guided restore section */}
      {!hasSecureSettings && guidedDiffs.length > 0 && (
        <SectionCard title={`Guided Restore (${guidedDiffs.length})`}>
          <Text style={styles.sectionDescription}>
            These need manual changes. Tap "Open Settings" to go to the right screen.
          </Text>
          {guidedDiffs.map((diff) => (
            <RestoreItem
              key={diff.key}
              diff={diff}
              status={restoreStatuses[diff.key] || 'pending'}
              checked={checkedSettings[diff.key] ?? true}
              onToggle={() => toggleSetting(diff.key)}
              onRestore={() => handleRestoreSetting(diff)}
              onOpenSettings={() =>
                diff.settingsIntent && handleOpenSettings(diff.settingsIntent)
              }
              guided
            />
          ))}
        </SectionCard>
      )}

      {/* Missing apps — with checkboxes */}
      {comparison.apps.length > 0 && (
        <SectionCard title={`Missing Apps (${comparison.apps.length})`}>
          <Text style={styles.sectionDescription}>
            Apps from your old phone not on this one. Check the ones you want to install.
          </Text>
          <View style={styles.selectRow}>
            <Pressable onPress={() => toggleAllApps(true)}>
              <Text style={styles.selectAllText}>Select All</Text>
            </Pressable>
            <Pressable onPress={() => toggleAllApps(false)}>
              <Text style={styles.selectNoneText}>Select None</Text>
            </Pressable>
          </View>
          {comparison.apps.map((app) => (
            <AppRestoreRow
              key={app.packageName}
              app={app}
              checked={checkedApps[app.packageName] ?? true}
              onToggle={() => toggleApp(app.packageName)}
              onInstall={() => handleInstallApp(app.packageName)}
            />
          ))}
          <PrimaryButton
            label={`Install ${checkedAppsCount} Checked Apps`}
            onPress={() => {
              const toInstall = comparison.apps.filter((a) => checkedApps[a.packageName]);
              for (const app of toInstall) {
                handleInstallApp(app.packageName);
              }
            }}
          />
        </SectionCard>
      )}
    </>
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
  onRestore,
  onOpenSettings,
  guided,
}: {
  diff: SettingDiff;
  status: RestoreStatus;
  checked: boolean;
  onToggle: () => void;
  onRestore: () => void;
  onOpenSettings: () => void;
  guided?: boolean;
}) {
  const statusIcon =
    status === 'success' ? '✓' : status === 'failed' ? '✗' : status === 'restoring' ? '...' : '';
  const statusColor =
    status === 'success' ? '#4ade80' : status === 'failed' ? '#f87171' : '#e6b800';

  return (
    <View style={[styles.restoreItem, !checked && styles.restoreItemUnchecked]}>
      <View style={styles.restoreHeader}>
        <Checkbox checked={checked} onToggle={onToggle} />
        <Text style={[styles.restoreLabel, !checked && styles.labelDimmed]} numberOfLines={1}>
          {diff.label}
        </Text>
        {statusIcon ? (
          <Text style={[styles.statusIcon, { color: statusColor }]}>{statusIcon}</Text>
        ) : null}
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
          {status !== 'success' && (
            <View style={styles.restoreActions}>
              {!guided && (
                <Pressable style={styles.restoreBtn} onPress={onRestore}>
                  <Text style={styles.restoreBtnText}>Apply</Text>
                </Pressable>
              )}
              {diff.settingsIntent && (
                <Pressable style={styles.settingsBtn} onPress={onOpenSettings}>
                  <Text style={styles.settingsBtnText}>Open Settings</Text>
                </Pressable>
              )}
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
  progressText: {
    color: '#e6b800',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  progressBar: {
    height: 6,
    backgroundColor: '#1a2340',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4ade80',
    borderRadius: 3,
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
  selectRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 8,
  },
  selectAllText: {
    color: '#4ade80',
    fontSize: 13,
    fontWeight: '600',
  },
  selectNoneText: {
    color: '#6b7fa0',
    fontSize: 13,
    fontWeight: '600',
  },
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
  restoreItem: {
    backgroundColor: '#0f1628',
    borderRadius: 8,
    padding: 10,
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
    fontSize: 14,
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
    fontSize: 12,
    flex: 1,
  },
  newVal: {
    color: '#6b7fa0',
    fontSize: 12,
    flex: 1,
  },
  restoreActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
    marginLeft: 30,
  },
  restoreBtn: {
    backgroundColor: '#4ade80',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  restoreBtnText: {
    color: '#0f1628',
    fontSize: 12,
    fontWeight: '700',
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
});
