import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SectionCard } from '../components/SectionCard';
import { PrimaryButton } from '../components/PrimaryButton';
import type { DeviceProfile } from '../types/profile';

type Props = {
  onSelect: (profile: DeviceProfile) => void;
  onBack: () => void;
};

export function CloudProfilesScreen({ onSelect, onBack }: Props) {
  return (
    <>
      <SectionCard title="Cloud Backup">
        <View style={styles.comingSoonBadge}>
          <Text style={styles.comingSoonText}>COMING SOON</Text>
        </View>
        <Text style={styles.description}>
          Cloud backup will let you sync profiles across devices with Google Sign-In.
          For now, use the saved profiles on your device or share profile files
          via Bluetooth, email, or Google Drive.
        </Text>
        <PrimaryButton label="Go Back" onPress={onBack} />
      </SectionCard>
    </>
  );
}

const styles = StyleSheet.create({
  comingSoonBadge: {
    backgroundColor: '#2a1a00',
    borderRadius: 8,
    padding: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e6b800',
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
  },
  comingSoonText: {
    color: '#e6b800',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  description: {
    color: '#b7c1d6',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
});
