import React from "react";
import { Text } from "react-native";
import { SectionCard } from "../components/SectionCard";
import { DifferenceItem, DeviceProfile } from "../types/profile";

type Props = {
  importedProfile: DeviceProfile | null;
  comparison: DifferenceItem[];
};

export function ImportScreen({ importedProfile, comparison }: Props) {
  if (!importedProfile) {
    return (
      <SectionCard title="Imported profile">
        <Text style={{ color: "#d8deee" }}>No imported profile yet.</Text>
      </SectionCard>
    );
  }

  return (
    <>
      <SectionCard title="Imported profile" subtitle="Data loaded from a prior device snapshot.">
        <Text style={{ color: "#d8deee", lineHeight: 22 }}>
          {importedProfile.device.nickname} • {importedProfile.device.manufacturer} {importedProfile.device.model}
        </Text>
      </SectionCard>

      <SectionCard title="Detected differences" subtitle="These are the first settings mismatches the app knows how to compare.">
        {comparison.length === 0 ? (
          <Text style={{ color: "#d8deee" }}>No differences detected.</Text>
        ) : (
          comparison.map((item) => (
            <Text key={item.id} style={{ color: "#d8deee", lineHeight: 22 }}>
              • {item.label}: current={item.currentValue}, imported={item.importedValue}
            </Text>
          ))
        )}
      </SectionCard>
    </>
  );
}
