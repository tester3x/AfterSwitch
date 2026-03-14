import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { PrimaryButton } from './PrimaryButton';
import { getStepsForDiff, getIntentForDiff } from '../data/settingsRegistry';
import {
  openSettingsScreen,
  readSystemSettings,
  readSecureSettings,
  readGlobalSettings,
  readSamsungSettings,
  readDefaultApps,
} from '../services/settingsReader';
import type { SettingDiff } from '../types/profile';

type Props = {
  diffs: SettingDiff[];
  isSamsung: boolean;
  onComplete: () => void;
  onSettingVerified: (key: string) => void;
};

type VerifyState = 'idle' | 'checking' | 'success' | 'unchanged';

export function GuidedWizard({ diffs, isSamsung, onComplete, onSettingVerified }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [verifyState, setVerifyState] = useState<VerifyState>('idle');
  const [waitingForReturn, setWaitingForReturn] = useState(false);
  const [copied, setCopied] = useState(false);
  const appStateRef = useRef(AppState.currentState);
  const progressAnim = useRef(new Animated.Value(0)).current;

  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopyLabel = useCallback(async (label: string) => {
    await Clipboard.setStringAsync(label);
    setCopied(true);
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => setCopied(false), 1500);
  }, []);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, []);

  // Animate progress bar
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: diffs.length > 0 ? (currentIndex / diffs.length) * 100 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [currentIndex, diffs.length]);

  // Listen for app resume
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (nextAppState) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === 'active' &&
        waitingForReturn
      ) {
        setWaitingForReturn(false);
        await verifyCurrent();
      }
      appStateRef.current = nextAppState;
    });
    return () => sub.remove();
  }, [waitingForReturn, currentIndex]);

  const verifyCurrent = useCallback(async () => {
    if (currentIndex >= diffs.length) return;
    setVerifyState('checking');
    const diff = diffs[currentIndex];

    try {
      const rawKey = diff.key.split('.').slice(1).join('.');

      if (diff.category === 'defaults') {
        const defaults = await readDefaultApps();
        const defaultKey = diff.key.replace('defaults.', '');
        const current = defaults[defaultKey];
        const currentPkg = current?.packageName || '';
        if (currentPkg && currentPkg !== diff.rawNewValue) {
          handleSuccess(diff.key);
          return;
        }
        setVerifyState('unchanged');
        return;
      }

      let allSettings: Record<string, string> = {};
      if (diff.category === 'system') {
        allSettings = await readSystemSettings();
      } else if (diff.category === 'secure') {
        allSettings = await readSecureSettings();
      } else if (diff.category === 'global') {
        allSettings = await readGlobalSettings();
      } else if (diff.category === 'samsung') {
        allSettings = await readSamsungSettings();
      }

      const currentValue = allSettings[rawKey];
      if (currentValue !== undefined && currentValue !== diff.rawNewValue) {
        handleSuccess(diff.key);
      } else {
        setVerifyState('unchanged');
      }
    } catch {
      setVerifyState('unchanged');
    }
  }, [currentIndex, diffs]);

  const handleSuccess = useCallback((key: string) => {
    setVerifyState('success');
    onSettingVerified(key);
    setTimeout(() => advanceToNext(), 1200);
  }, [currentIndex, diffs.length]);

  const advanceToNext = useCallback(() => {
    const nextIndex = currentIndex + 1;
    if (nextIndex >= diffs.length) {
      onComplete();
    } else {
      setCurrentIndex(nextIndex);
      setVerifyState('idle');
      setCopied(false);
    }
  }, [currentIndex, diffs.length]);

  const handleOpenSettings = useCallback(async () => {
    if (currentIndex >= diffs.length) return;
    const diff = diffs[currentIndex];
    const intent = getIntentForDiff(diff, isSamsung);
    setWaitingForReturn(true);
    setVerifyState('idle');
    await openSettingsScreen(intent);
  }, [currentIndex, diffs, isSamsung]);

  const handleSkip = useCallback(() => {
    advanceToNext();
  }, [advanceToNext]);

  if (diffs.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.allDoneText}>No guided settings to restore!</Text>
      </View>
    );
  }

  if (currentIndex >= diffs.length) {
    return (
      <View style={styles.container}>
        <Text style={styles.allDoneText}>All done!</Text>
      </View>
    );
  }

  const diff = diffs[currentIndex];
  const { steps, isGeneric } = getStepsForDiff(diff, isSamsung);

  return (
    <View style={styles.container}>
      {/* Progress header */}
      <View style={styles.progressHeader}>
        <Text style={styles.progressTitle}>Guided Restore</Text>
        <Text style={styles.progressCount}>
          {currentIndex + 1} of {diffs.length}
        </Text>
      </View>
      <View style={styles.progressBarBg}>
        <Animated.View
          style={[
            styles.progressBarFill,
            {
              width: progressAnim.interpolate({
                inputRange: [0, 100],
                outputRange: ['0%', '100%'],
              }),
            },
          ]}
        />
      </View>

      {/* Setting info — tap label to copy for Settings search */}
      <Pressable onPress={() => handleCopyLabel(diff.label)}>
        <Text style={styles.settingLabel}>
          {diff.label}
          <Text style={styles.copyHint}>{copied ? '  Copied!' : '  (tap to copy)'}</Text>
        </Text>
      </Pressable>
      {diff.description && (
        <Text style={styles.settingDescription}>{diff.description}</Text>
      )}

      {/* Want / Have */}
      <View style={styles.valuesBox}>
        <View style={styles.valueRow}>
          <Text style={styles.valueLabel}>Want:</Text>
          <Text style={styles.wantValue} numberOfLines={1}>{diff.oldValue}</Text>
        </View>
        <View style={styles.valueRow}>
          <Text style={styles.valueLabel}>Have:</Text>
          <Text style={styles.haveValue} numberOfLines={1}>{diff.newValue}</Text>
        </View>
      </View>

      {/* Steps */}
      <View style={styles.stepsContainer}>
        <Text style={styles.stepsTitle}>HOW TO CHANGE:</Text>
        {isGeneric && (
          <Text style={styles.genericBadge}>Generic instructions</Text>
        )}
        {steps.map((step, i) => (
          <View key={i} style={styles.stepRow}>
            <Text style={styles.stepNumber}>{i + 1}.</Text>
            <Text style={styles.stepText}>{step}</Text>
          </View>
        ))}
      </View>

      {/* Action area */}
      {verifyState === 'idle' && !waitingForReturn && (
        <PrimaryButton label="Open Settings" onPress={handleOpenSettings} />
      )}

      {waitingForReturn && (
        <View style={styles.waitingBox}>
          <ActivityIndicator size="small" color="#e6b800" />
          <Text style={styles.waitingText}>
            Make the change, then come back here...
          </Text>
        </View>
      )}

      {verifyState === 'checking' && (
        <View style={styles.waitingBox}>
          <ActivityIndicator size="small" color="#60a5fa" />
          <Text style={styles.waitingText}>Checking...</Text>
        </View>
      )}

      {verifyState === 'success' && (
        <View style={styles.successBox}>
          <Text style={styles.successIcon}>✓</Text>
          <Text style={styles.successText}>Changed!</Text>
        </View>
      )}

      {verifyState === 'unchanged' && (
        <View style={styles.unchangedBox}>
          <Text style={styles.unchangedText}>
            Setting didn't change. Try again or skip.
          </Text>
          <View style={styles.unchangedButtons}>
            <Pressable style={styles.retryBtn} onPress={handleOpenSettings}>
              <Text style={styles.retryBtnText}>Try Again</Text>
            </Pressable>
            <Pressable style={styles.skipBtnInline} onPress={handleSkip}>
              <Text style={styles.skipBtnText}>Skip</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Footer */}
      <View style={styles.footer}>
        {verifyState !== 'success' && verifyState !== 'unchanged' && (
          <Pressable onPress={handleSkip}>
            <Text style={styles.skipText}>Skip →</Text>
          </Pressable>
        )}
        <View style={{ flex: 1 }} />
        <Pressable onPress={onComplete}>
          <Text style={styles.exitText}>Exit Wizard</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  // Progress
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressTitle: {
    color: '#e6b800',
    fontSize: 14,
    fontWeight: '700',
  },
  progressCount: {
    color: '#6b7fa0',
    fontSize: 13,
  },
  progressBarBg: {
    height: 4,
    backgroundColor: '#1a2340',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#e6b800',
    borderRadius: 2,
  },
  // Setting info
  settingLabel: {
    color: 'white',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 4,
  },
  settingDescription: {
    color: '#8090b0',
    fontSize: 13,
  },
  copyHint: {
    color: '#4ade80',
    fontSize: 12,
    fontWeight: '400',
  },
  // Values
  valuesBox: {
    backgroundColor: '#0f1628',
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  valueRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  valueLabel: {
    color: '#6b7fa0',
    fontSize: 13,
    width: 44,
  },
  wantValue: {
    color: '#60a5fa',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  haveValue: {
    color: '#6b7fa0',
    fontSize: 14,
    flex: 1,
  },
  // Steps
  stepsContainer: {
    gap: 6,
  },
  stepsTitle: {
    color: '#e6b800',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  genericBadge: {
    color: '#60a5fa',
    fontSize: 10,
    fontStyle: 'italic',
  },
  stepRow: {
    flexDirection: 'row',
    gap: 8,
    paddingLeft: 4,
  },
  stepNumber: {
    color: '#e6b800',
    fontSize: 14,
    fontWeight: '700',
    width: 20,
  },
  stepText: {
    color: '#b7c1d6',
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  // Waiting
  waitingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#0f1628',
    borderRadius: 10,
    padding: 14,
  },
  waitingText: {
    color: '#8090b0',
    fontSize: 13,
    fontStyle: 'italic',
  },
  // Success
  successBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#0a2016',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#4ade80',
  },
  successIcon: {
    color: '#4ade80',
    fontSize: 22,
    fontWeight: '700',
  },
  successText: {
    color: '#4ade80',
    fontSize: 16,
    fontWeight: '700',
  },
  // Unchanged
  unchangedBox: {
    backgroundColor: '#1a1400',
    borderRadius: 10,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: '#e6b800',
  },
  unchangedText: {
    color: '#e6b800',
    fontSize: 13,
  },
  unchangedButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  retryBtn: {
    backgroundColor: '#e6b800',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  retryBtnText: {
    color: '#111',
    fontSize: 13,
    fontWeight: '700',
  },
  skipBtnInline: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4a5568',
  },
  skipBtnText: {
    color: '#8090b0',
    fontSize: 13,
    fontWeight: '600',
  },
  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 4,
  },
  skipText: {
    color: '#6b7fa0',
    fontSize: 13,
  },
  exitText: {
    color: '#f87171',
    fontSize: 13,
  },
  allDoneText: {
    color: '#4ade80',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: 12,
  },
});
