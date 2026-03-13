import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SectionCard } from '../components/SectionCard';
import { PrimaryButton } from '../components/PrimaryButton';
import { GROUP_LABELS } from '../data/settingsRegistry';
import type { ComparisonResult, SettingDiff } from '../types/profile';
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

  // Check permissions on first render
  React.useEffect(() => {
    (async () => {
      setHasWriteSettings(await canWriteSettings());
      setHasSecureSettings(await canWriteSecureSettings());
    })();
  }, []);

  const handleRequestWritePermission = useCallback(async () => {
    await requestWritePermission();
    // Re-check after user returns (they toggle it in system settings)
    setTimeout(async () => {
      setHasWriteSettings(await canWriteSettings());
    }, 2000);
  }, []);

  const handleRestoreSetting = useCallback(async (diff: SettingDiff) => {
    setRestoreStatuses((prev) => ({ ...prev, [diff.key]: 'restoring' }));

    try {
      const [category, ...keyParts] = diff.key.split('.');
      const rawKey = keyParts.join('.');
      // oldValue is the value from the imported (old) profile — that's what we want to restore
      // We need the raw value, not the formatted one. Extract from the key.
      // For now, we write the raw old value from the profile
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

  const handleRestoreAll = useCallback(async (diffs: SettingDiff[]) => {
    for (const diff of diffs) {
      if (restoreStatuses[diff.key] === 'success') continue;
      await handleRestoreSetting(diff);
    }
  }, [restoreStatuses, handleRestoreSetting]);

  const handleOpenSettings = useCallback(async (intent: string) => {
    await openSettingsScreen(intent);
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

  return (
    <>
      {/* Progress */}
      <SectionCard title="Restore Progress">
        <Text style={styles.progressText}>
          {restoredCount} / {comparison.summary.totalDiffs} items restored
        </Text>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              { width: `${(restoredCount / comparison.summary.totalDiffs) * 100}%` },
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
            These settings can be applied automatically.
          </Text>
          <PrimaryButton
            label="Restore All"
            onPress={() => handleRestoreAll(autoDiffs)}
          />
          {autoDiffs.map((diff) => (
            <RestoreItem
              key={diff.key}
              diff={diff}
              status={restoreStatuses[diff.key] || 'pending'}
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
            Desktop companion unlocked these. Auto-restoring secure + global settings.
          </Text>
          <PrimaryButton
            label="Restore All Unlocked"
            onPress={() => handleRestoreAll(secureAutoDiffs)}
          />
          {secureAutoDiffs.map((diff) => (
            <RestoreItem
              key={diff.key}
              diff={diff}
              status={restoreStatuses[diff.key] || 'pending'}
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
              onRestore={() => handleRestoreSetting(diff)}
              onOpenSettings={() =>
                diff.settingsIntent && handleOpenSettings(diff.settingsIntent)
              }
              guided
            />
          ))}
        </SectionCard>
      )}

      {/* Missing apps */}
      {comparison.apps.length > 0 && (
        <SectionCard title={`Missing Apps (${comparison.apps.length})`}>
          {comparison.apps.map((app) => (
            <View key={app.packageName} style={styles.appRow}>
              <Text style={styles.appLabel}>{app.label}</Text>
              <Text style={styles.appPackage}>{app.packageName}</Text>
            </View>
          ))}
        </SectionCard>
      )}
    </>
  );
}

function RestoreItem({
  diff,
  status,
  onRestore,
  onOpenSettings,
  guided,
}: {
  diff: SettingDiff;
  status: RestoreStatus;
  onRestore: () => void;
  onOpenSettings: () => void;
  guided?: boolean;
}) {
  const statusIcon =
    status === 'success' ? '✓' : status === 'failed' ? '✗' : status === 'restoring' ? '...' : '';
  const statusColor =
    status === 'success' ? '#4ade80' : status === 'failed' ? '#f87171' : '#e6b800';

  return (
    <View style={styles.restoreItem}>
      <View style={styles.restoreHeader}>
        <Text style={styles.restoreLabel} numberOfLines={1}>
          {diff.label}
        </Text>
        {statusIcon ? (
          <Text style={[styles.statusIcon, { color: statusColor }]}>{statusIcon}</Text>
        ) : null}
      </View>
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
  restoreItem: {
    backgroundColor: '#0f1628',
    borderRadius: 8,
    padding: 10,
    gap: 4,
  },
  restoreHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  restoreLabel: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  statusIcon: {
    fontSize: 16,
    fontWeight: '700',
  },
  restoreValues: {
    flexDirection: 'row',
    gap: 12,
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
    backgroundColor: '#0f1628',
    borderRadius: 8,
    padding: 10,
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
});
