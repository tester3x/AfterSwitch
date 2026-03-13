import React, { useMemo, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { HomeScreen } from "./src/screens/HomeScreen";
import { SnapshotScreen } from "./src/screens/SnapshotScreen";
import { ImportScreen } from "./src/screens/ImportScreen";
import { RestoreScreen } from "./src/screens/RestoreScreen";
import { AppTab, DeviceProfile } from "./src/types/profile";
import { buildSampleProfile } from "./src/services/profileBuilder";
import { compareProfiles } from "./src/services/profileCompare";
import { exportProfileJson, importProfileFromPicker } from "./src/services/profileIO";
import { TabButton } from "./src/components/TabButton";

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>("home");
  const [currentProfile, setCurrentProfile] = useState<DeviceProfile>(buildSampleProfile());
  const [importedProfile, setImportedProfile] = useState<DeviceProfile | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("Ready.");

  const comparison = useMemo(() => {
    if (!importedProfile) return [];
    return compareProfiles(currentProfile, importedProfile);
  }, [currentProfile, importedProfile]);

  const handleCreateSnapshot = () => {
    const profile = buildSampleProfile();
    setCurrentProfile(profile);
    setStatusMessage(`Snapshot refreshed for ${profile.device.nickname}.`);
    setActiveTab("snapshot");
  };

  const handleExport = async () => {
    try {
      const uri = await exportProfileJson(currentProfile);
      setStatusMessage(`Profile exported: ${uri}`);
    } catch (error) {
      setStatusMessage(`Export failed: ${String(error)}`);
    }
  };

  const handleImport = async () => {
    try {
      const imported = await importProfileFromPicker();
      if (!imported) {
        setStatusMessage("Import canceled.");
        return;
      }
      setImportedProfile(imported);
      setStatusMessage(`Imported profile from ${imported.device.nickname}.`);
      setActiveTab("import");
    } catch (error) {
      setStatusMessage(`Import failed: ${String(error)}`);
    }
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Text style={styles.title}>AfterSwitch</Text>
          <Text style={styles.subtitle}>Finish what phone migration misses.</Text>
        </View>

        <View style={styles.tabRow}>
          <TabButton label="Home" active={activeTab === "home"} onPress={() => setActiveTab("home")} />
          <TabButton label="Snapshot" active={activeTab === "snapshot"} onPress={() => setActiveTab("snapshot")} />
          <TabButton label="Import" active={activeTab === "import"} onPress={() => setActiveTab("import")} />
          <TabButton label="Restore" active={activeTab === "restore"} onPress={() => setActiveTab("restore")} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {activeTab === "home" && (
            <HomeScreen
              profile={currentProfile}
              onCreateSnapshot={handleCreateSnapshot}
              onExport={handleExport}
              onImport={handleImport}
              onOpenRestore={() => setActiveTab("restore")}
            />
          )}
          {activeTab === "snapshot" && <SnapshotScreen profile={currentProfile} />}
          {activeTab === "import" && <ImportScreen importedProfile={importedProfile} comparison={comparison} />}
          {activeTab === "restore" && (
            <RestoreScreen currentProfile={currentProfile} importedProfile={importedProfile} comparison={comparison} />
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Text style={styles.footerText}>{statusMessage}</Text>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0b1020"
  },
  header: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 12
  },
  title: {
    color: "white",
    fontSize: 28,
    fontWeight: "700"
  },
  subtitle: {
    color: "#b7c1d6",
    fontSize: 14,
    marginTop: 4
  },
  tabRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 8,
    flexWrap: "wrap"
  },
  content: {
    padding: 14,
    gap: 12
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#2e3853",
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  footerText: {
    color: "#d7def0",
    fontSize: 12
  }
});
