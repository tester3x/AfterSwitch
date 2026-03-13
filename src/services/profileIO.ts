import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { DeviceProfile } from "../types/profile";

const FILE_NAME = "afterswitch-profile.json";

export async function exportProfileJson(profile: DeviceProfile): Promise<string> {
  const directory = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!directory) {
    throw new Error("No writable directory available.");
  }

  const uri = directory + FILE_NAME;
  await FileSystem.writeAsStringAsync(uri, JSON.stringify(profile, null, 2), {
    encoding: FileSystem.EncodingType.UTF8
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri);
  }

  return uri;
}

export async function importProfileFromPicker(): Promise<DeviceProfile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: "application/json",
    copyToCacheDirectory: true,
    multiple: false
  });

  if (result.canceled) {
    return null;
  }

  const asset = result.assets[0];
  const content = await FileSystem.readAsStringAsync(asset.uri, {
    encoding: FileSystem.EncodingType.UTF8
  });

  return JSON.parse(content) as DeviceProfile;
}
