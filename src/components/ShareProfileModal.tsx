import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import QRCode from 'react-native-qrcode-svg';
import {
  shareProfile,
  unshareProfile,
  getMySharedProfiles,
  type SharedProfileMeta,
} from '../services/sharedProfiles';
import type { DeviceProfile } from '../types/profile';

type Props = {
  visible: boolean;
  profile: DeviceProfile | null;
  ownerName: string;
  onClose: () => void;
};

export function ShareProfileModal({ visible, profile, ownerName, onClose }: Props) {
  const [sharing, setSharing] = useState(false);
  const [sharedMeta, setSharedMeta] = useState<SharedProfileMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  // Check if this profile is already shared
  useEffect(() => {
    if (!visible || !profile) return;
    setLoading(true);
    getMySharedProfiles()
      .then((list) => {
        // Match by device model + settings count (close enough for identity)
        const match = list.find(
          (m) =>
            m.model === profile.device.model &&
            m.deviceName === profile.device.nickname,
        );
        setSharedMeta(match || null);
      })
      .catch(() => setSharedMeta(null))
      .finally(() => setLoading(false));
  }, [visible, profile]);

  const handleShare = useCallback(async () => {
    if (!profile) return;
    setSharing(true);
    try {
      const { sharedId, shareCode } = await shareProfile(profile, ownerName);
      setSharedMeta({
        id: sharedId,
        shareCode,
        deviceName: profile.device.nickname,
        model: profile.device.model,
        manufacturer: profile.device.manufacturer,
        sharedAt: new Date().toISOString(),
        settingsCount: 0,
        appsCount: 0,
        ownerName,
        downloads: 0,
      });
    } catch (e) {
      Alert.alert('Share Failed', String(e));
    } finally {
      setSharing(false);
    }
  }, [profile, ownerName]);

  const handleUnshare = useCallback(async () => {
    if (!sharedMeta) return;
    Alert.alert(
      'Remove from Community?',
      'Your profile will no longer be browseable by others.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await unshareProfile(sharedMeta.id);
              setSharedMeta(null);
            } catch (e) {
              Alert.alert('Failed', String(e));
            }
          },
        },
      ],
    );
  }, [sharedMeta]);

  const handleCopyCode = useCallback(async () => {
    if (!sharedMeta) return;
    await Clipboard.setStringAsync(sharedMeta.shareCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [sharedMeta]);

  const handleCopyLink = useCallback(async () => {
    if (!sharedMeta) return;
    const link = `afterswitch://profile/${sharedMeta.shareCode}`;
    await Clipboard.setStringAsync(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [sharedMeta]);

  const handleShareLink = useCallback(async () => {
    if (!sharedMeta) return;
    const link = `afterswitch://profile/${sharedMeta.shareCode}`;
    try {
      // Use native share sheet
      if (await Sharing.isAvailableAsync()) {
        // Sharing.shareAsync needs a file URI, so we use clipboard + alert
        await Clipboard.setStringAsync(
          `Check out my phone setup on AfterSwitch! Code: ${sharedMeta.shareCode}\n${link}`,
        );
        Alert.alert('Copied!', 'Share link copied to clipboard. Paste it anywhere!');
      }
    } catch {
      await Clipboard.setStringAsync(link);
      Alert.alert('Copied!', 'Share link copied to clipboard.');
    }
  }, [sharedMeta]);

  if (!profile) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Share Profile</Text>
            <Pressable onPress={onClose}>
              <Text style={styles.closeBtn}>Done</Text>
            </Pressable>
          </View>

          <Text style={styles.deviceName}>
            {profile.device.manufacturer} {profile.device.model}
          </Text>
          <Text style={styles.deviceSub}>{profile.device.nickname}</Text>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#e6b800" />
            </View>
          ) : !sharedMeta ? (
            // Not shared yet — show share button
            <View style={styles.notSharedBox}>
              <Text style={styles.notSharedText}>
                Share your phone setup with the AfterSwitch community.
                Others can browse and apply your settings to their device.
              </Text>
              <Pressable
                style={styles.shareBtn}
                onPress={handleShare}
                disabled={sharing}
              >
                {sharing ? (
                  <ActivityIndicator size="small" color="#111" />
                ) : (
                  <Text style={styles.shareBtnText}>Share to Community</Text>
                )}
              </Pressable>
            </View>
          ) : (
            // Already shared — show QR, code, link
            <View style={styles.sharedBox}>
              {/* QR Code */}
              <View style={styles.qrContainer}>
                <QRCode
                  value={`afterswitch://profile/${sharedMeta.shareCode}`}
                  size={180}
                  backgroundColor="#0f1628"
                  color="#e6b800"
                />
              </View>

              {/* Share Code */}
              <View style={styles.codeBox}>
                <Text style={styles.codeLabel}>SHARE CODE</Text>
                <Pressable onPress={handleCopyCode}>
                  <Text style={styles.codeValue}>{sharedMeta.shareCode}</Text>
                </Pressable>
                <Text style={styles.codeTap}>
                  {copied ? 'Copied!' : 'Tap to copy'}
                </Text>
              </View>

              {/* Stats */}
              {sharedMeta.downloads > 0 && (
                <Text style={styles.downloadCount}>
                  {sharedMeta.downloads} download{sharedMeta.downloads !== 1 ? 's' : ''}
                </Text>
              )}

              {/* Action buttons */}
              <View style={styles.actionRow}>
                <Pressable style={styles.actionBtn} onPress={handleCopyLink}>
                  <Text style={styles.actionBtnText}>Copy Link</Text>
                </Pressable>
                <Pressable style={styles.actionBtn} onPress={handleShareLink}>
                  <Text style={styles.actionBtnText}>Share</Text>
                </Pressable>
              </View>

              {/* Unshare */}
              <Pressable style={styles.unshareBtn} onPress={handleUnshare}>
                <Text style={styles.unshareBtnText}>Remove from Community</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#141b2d',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    color: 'white',
    fontSize: 20,
    fontWeight: '700',
  },
  closeBtn: {
    color: '#60a5fa',
    fontSize: 15,
    fontWeight: '600',
  },
  deviceName: {
    color: '#b7c1d6',
    fontSize: 14,
    fontWeight: '600',
  },
  deviceSub: {
    color: '#6b7fa0',
    fontSize: 12,
    marginBottom: 16,
  },
  center: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  // Not shared state
  notSharedBox: {
    gap: 16,
    paddingVertical: 12,
  },
  notSharedText: {
    color: '#8090b0',
    fontSize: 14,
    lineHeight: 20,
  },
  shareBtn: {
    backgroundColor: '#e6b800',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  shareBtnText: {
    color: '#111',
    fontSize: 16,
    fontWeight: '700',
  },
  // Shared state
  sharedBox: {
    gap: 16,
    alignItems: 'center',
  },
  qrContainer: {
    backgroundColor: '#0f1628',
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#25304c',
  },
  codeBox: {
    alignItems: 'center',
    gap: 4,
  },
  codeLabel: {
    color: '#6b7fa0',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
  },
  codeValue: {
    color: '#e6b800',
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: 6,
  },
  codeTap: {
    color: '#4a5a7a',
    fontSize: 11,
    fontStyle: 'italic',
  },
  downloadCount: {
    color: '#6b7fa0',
    fontSize: 12,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  actionBtn: {
    flex: 1,
    backgroundColor: '#1a2340',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#25304c',
  },
  actionBtnText: {
    color: '#60a5fa',
    fontSize: 14,
    fontWeight: '600',
  },
  unshareBtn: {
    paddingVertical: 8,
  },
  unshareBtnText: {
    color: '#f87171',
    fontSize: 13,
  },
});
