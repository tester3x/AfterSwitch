import React from "react";
import { Text } from "react-native";
import { InfoRow } from "../components/InfoRow";
import { SectionCard } from "../components/SectionCard";
import { DeviceProfile } from "../types/profile";

type Props = {
  profile: DeviceProfile;
};

export function SnapshotScreen({ profile }: Props) {
  return (
    <>
      <SectionCard title="Snapshot metadata">
        <InfoRow label="Schema version" value={String(profile.schemaVersion)} />
        <InfoRow label="Exported at" value={profile.exportedAt} />
      </SectionCard>

      <SectionCard title="Defaults">
        <InfoRow label="Keyboard" value={profile.defaults.keyboard} />
        <InfoRow label="Browser" value={profile.defaults.browser} />
        <InfoRow label="SMS app" value={profile.defaults.sms} />
        <InfoRow label="Launcher" value={profile.defaults.launcher} />
      </SectionCard>

      <SectionCard title="Checklist preview">
        {profile.checklist.map((item) => (
          <Text key={item.id} style={{ color: "#d8deee", lineHeight: 22 }}>
            • {item.title}: {item.expectedValue}
          </Text>
        ))}
      </SectionCard>
    </>
  );
}
