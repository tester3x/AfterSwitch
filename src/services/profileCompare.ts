import { DeviceProfile, DifferenceItem } from "../types/profile";

export function compareProfiles(current: DeviceProfile, imported: DeviceProfile): DifferenceItem[] {
  const differences: DifferenceItem[] = [];

  compareValue(differences, "defaults.keyboard", "Default keyboard", current.defaults.keyboard, imported.defaults.keyboard);
  compareValue(differences, "defaults.browser", "Default browser", current.defaults.browser, imported.defaults.browser);
  compareValue(
    differences,
    "system.screen_off_timeout",
    "Screen timeout",
    current.settings.system.screen_off_timeout,
    imported.settings.system.screen_off_timeout
  );
  compareValue(
    differences,
    "secure.show_alternative_characters",
    "Samsung Keyboard alternative characters",
    current.settings.secure.show_alternative_characters,
    imported.settings.secure.show_alternative_characters
  );

  return differences;
}

function compareValue(
  list: DifferenceItem[],
  id: string,
  label: string,
  currentValue: string | undefined,
  importedValue: string | undefined
) {
  const a = currentValue ?? "(missing)";
  const b = importedValue ?? "(missing)";
  if (a !== b) {
    list.push({
      id,
      label,
      currentValue: a,
      importedValue: b,
      severity: "warning"
    });
  }
}
