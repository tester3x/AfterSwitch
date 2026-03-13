import React from "react";
import { Text } from "react-native";
import { PrimaryButton } from "../components/PrimaryButton";
import { SectionCard } from "../components/SectionCard";
import { InfoRow } from "../components/InfoRow";
import { DeviceProfile } from "../types/profile";

type Props = {
  profile: DeviceProfile;
  onCreateSnapshot: () => void;
  onExport: () => void;
  onImport: () => void;
  onOpenRestore: () => void;
};

export function HomeScreen({ profile, onCreateSnapshot, onExport, onImport, onOpenRestore }: Props) {
  return (
    <>
      <SectionCard title="Current device profile" subtitle="This is the source-of-truth snapshot model for your old phone.">
        <InfoRow label="Nickname" value={profile.device.nickname} />
        <InfoRow label="Device" value={`${profile.device.manufacturer} ${profile.device.model}`} />
        <InfoRow label="OS" value={`${profile.device.os} ${profile.device.osVersion}`} />
        <InfoRow label="Keyboard" value={profile.defaults.keyboard} />
      </SectionCard>

      <SectionCard title="Actions" subtitle="Basic v1 flow for creating, exporting, importing, and restoring.">
        <PrimaryButton label="Refresh Snapshot" onPress={onCreateSnapshot} />
        <PrimaryButton label="Export Snapshot JSON" onPress={onExport} />
        <PrimaryButton label="Import Snapshot JSON" onPress={onImport} />
        <PrimaryButton label="Open Guided Restore" onPress={onOpenRestore} />
      </SectionCard>

      <SectionCard title="What this starter does" subtitle="This is a scaffold, not the full settings engine yet.">
        <Text style={{ color: "#d8deee", lineHeight: 20 }}>
          It defines the profile schema, exports and imports JSON, compares a few key settings, and shows the guided
          restore checklist structure for the Samsung-first version.
        </Text>
      </SectionCard>
    </>
  );
}
