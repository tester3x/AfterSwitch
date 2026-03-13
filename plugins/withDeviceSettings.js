/**
 * Expo config plugin: withDeviceSettings
 *
 * Injects the DeviceSettingsModule native module into the Android project
 * during EAS Build prebuild. It:
 * 1. Copies DeviceSettingsModule.kt + DeviceSettingsPackage.kt into android source
 * 2. Patches MainApplication to register DeviceSettingsPackage
 * 3. Adds required permissions to AndroidManifest.xml
 */

const {
  withAndroidManifest,
  withDangerousMod,
  withMainApplication,
} = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Copy Kotlin native module files into the android project.
 */
function withDeviceSettingsFiles(config) {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const pluginDir = path.join(__dirname, "android");
      const targetDir = path.join(
        config.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "java",
        "com",
        "afterswitch",
        "app"
      );

      // Ensure target directory exists
      fs.mkdirSync(targetDir, { recursive: true });

      // Copy Kotlin files
      const filesToCopy = [
        "DeviceSettingsModule.kt",
        "DeviceSettingsPackage.kt",
      ];

      for (const file of filesToCopy) {
        const src = path.join(pluginDir, file);
        const dest = path.join(targetDir, file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, dest);
          console.log(`[withDeviceSettings] Copied ${file}`);
        } else {
          console.warn(`[withDeviceSettings] WARNING: ${file} not found at ${src}`);
        }
      }

      return config;
    },
  ]);
}

/**
 * Register DeviceSettingsPackage in MainApplication.
 */
function withDeviceSettingsMainApplication(config) {
  return withMainApplication(config, (config) => {
    let contents = config.modResults.contents;

    // Add import if not present
    const importLine = "import com.afterswitch.app.DeviceSettingsPackage";
    if (!contents.includes(importLine)) {
      // Add after the last import statement
      const lastImportIdx = contents.lastIndexOf("import ");
      const nextLineIdx = contents.indexOf("\n", lastImportIdx);
      contents =
        contents.slice(0, nextLineIdx + 1) +
        importLine +
        "\n" +
        contents.slice(nextLineIdx + 1);
      console.log("[withDeviceSettings] Added DeviceSettingsPackage import");
    }

    // Add package registration if not present
    const registrationLine = "packages.add(DeviceSettingsPackage())";
    if (!contents.includes(registrationLine)) {
      // Find the getPackages() method and add after the packages list creation
      // Look for "packages.add(" pattern or "return packages" and insert before it
      const returnIdx = contents.indexOf("return packages");
      if (returnIdx > -1) {
        contents =
          contents.slice(0, returnIdx) +
          "      " +
          registrationLine +
          "\n      " +
          contents.slice(returnIdx);
        console.log("[withDeviceSettings] Added DeviceSettingsPackage registration");
      } else {
        // Alternative: look for PackageList and add after
        const packageListIdx = contents.indexOf("PackageList(");
        if (packageListIdx > -1) {
          const afterPackageList = contents.indexOf("\n", packageListIdx);
          contents =
            contents.slice(0, afterPackageList + 1) +
            "      " +
            registrationLine +
            "\n" +
            contents.slice(afterPackageList + 1);
          console.log("[withDeviceSettings] Added DeviceSettingsPackage registration (alt)");
        }
      }
    }

    config.modResults.contents = contents;
    return config;
  });
}

/**
 * Add required permissions to AndroidManifest.xml.
 */
function withDeviceSettingsPermissions(config) {
  return withAndroidManifest(config, async (config) => {
    const manifest = config.modResults.manifest;

    if (!manifest["uses-permission"]) {
      manifest["uses-permission"] = [];
    }

    const permissionsToAdd = [
      // For writing Settings.System values
      "android.permission.WRITE_SETTINGS",
      // For listing all installed packages on Android 11+
      "android.permission.QUERY_ALL_PACKAGES",
    ];

    for (const perm of permissionsToAdd) {
      const exists = manifest["uses-permission"].some(
        (p) => p.$?.["android:name"] === perm
      );
      if (!exists) {
        manifest["uses-permission"].push({
          $: { "android:name": perm },
        });
        console.log(`[withDeviceSettings] Added ${perm} permission`);
      }
    }

    return config;
  });
}

module.exports = function withDeviceSettings(config) {
  config = withDeviceSettingsFiles(config);
  config = withDeviceSettingsMainApplication(config);
  config = withDeviceSettingsPermissions(config);
  return config;
};
