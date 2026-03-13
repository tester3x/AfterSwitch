import React from "react";
import { Text } from "react-native";
import { SectionCard } from "../components/SectionCard";
import { DeviceProfile, DifferenceItem } from "../types/profile";

type Props = {
  currentProfile: DeviceProfile;
  importedProfile: DeviceProfile | null;
  comparison: DifferenceItem[];
};

export function RestoreScreen({ currentProfile, importedProfile, comparison }: Props) {
  return (
    <>
      <SectionCard title="Guided restore" subtitle="This is where v1 walks the user through cleanup after Smart Switch.">
        <Text style={{ color: "#d8deee", lineHeight: 22 }}>
          Current device: {currentProfile.device.nickname}
        </Text>
        <Text style={{ color: "#d8deee", lineHeight: 22 }}>
          Source profile: {importedProfile ? importedProfile.device.nickname : "Not imported yet"}
        </Text>
      </SectionCard>

      <SectionCard title="Actions to finish">
        {(importedProfile?.checklist ?? currentProfile.checklist).map((item) => (
          <Text key={item.id} style={{ color: "#d8deee", lineHeight: 22 }}>
            • {item.title} → {item.expectedValue}
            {item.routeHint ? ` (${item.routeHint})` : ""}
          </Text>
        ))}
      </SectionCard>

      <SectionCard title="Comparison summary">
        <Text style={{ color: "#d8deee", lineHeight: 22 }}>
          {comparison.length} mismatch{comparison.length === 1 ? "" : "es"} found.
        </Text>
      </SectionCard>
    </>
  );
}
