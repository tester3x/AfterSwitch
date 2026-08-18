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

// The inline Kotlin fallbacks were REMOVED. plugins/android/ Kotlin is now the
// single source of truth, and the mod below throws if it is missing rather
// than compiling a hand-maintained copy that can silently drift.

/**
 * Copy the canonical Kotlin native module files into the android project.
 * plugins/android/ Kotlin is the only source; a missing file fails the build.
 */
function withDeviceSettingsFiles(config) {
  return withDangerousMod(config, [
    "android",
    async (config) => {
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

      fs.mkdirSync(targetDir, { recursive: true });

      // SINGLE SOURCE OF TRUTH. plugins/android/ Kotlin is canonical, and its
      // absence is a hard build failure -- never a silent substitution.
      //
      // This used to fall back to an inline Kotlin string that had to be kept
      // in sync by hand, and it drifted. `.gitignore` carried an unanchored
      // `android/` rule which also matched `plugins/android/`, so EAS never
      // received the canonical file, the plugin quietly compiled the stale
      // inline copy, and the APK shipped without a native method the JS bridge
      // calls. The build succeeded; the failure only surfaced as a button that
      // did nothing on a real phone.
      //
      // A silent fallback that can differ from the real source is worse than
      // no fallback at all.
      const pluginDir = path.join(__dirname, "android");
      const moduleSrc = path.join(pluginDir, "DeviceSettingsModule.kt");
      const packageSrc = path.join(pluginDir, "DeviceSettingsPackage.kt");

      const missingSrc = [moduleSrc, packageSrc].filter((p) => !fs.existsSync(p));
      if (missingSrc.length > 0) {
        throw new Error(
          "[withDeviceSettings] Canonical native source missing: " +
            missingSrc.join(", ") +
            ". These files are the ONLY source for the DeviceSettings native " +
            "module. If this fails on EAS, the build archive did not include " +
            "plugins/android/ -- check .gitignore for an unanchored 'android/' " +
            "rule. Refusing to compile an incomplete module."
        );
      }

      fs.copyFileSync(moduleSrc, path.join(targetDir, "DeviceSettingsModule.kt"));
      fs.copyFileSync(packageSrc, path.join(targetDir, "DeviceSettingsPackage.kt"));
      console.log("[withDeviceSettings] Copied canonical Kotlin from plugins/android/");

      // Verify files exist
      const moduleExists = fs.existsSync(path.join(targetDir, "DeviceSettingsModule.kt"));
      const packageExists = fs.existsSync(path.join(targetDir, "DeviceSettingsPackage.kt"));
      console.log(`[withDeviceSettings] Verify: Module=${moduleExists}, Package=${packageExists}`);

      if (!moduleExists || !packageExists) {
        throw new Error("[withDeviceSettings] FATAL: Kotlin files missing after write!");
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
    // SDK 54 uses: PackageList(this).packages.apply { ... }
    // Inside .apply{}, the list is `this`, so we call add() directly (not packages.add())
    const shortReg = "add(DeviceSettingsPackage())";
    const longReg = "packages.add(DeviceSettingsPackage())";
    if (!contents.includes(shortReg) && !contents.includes(longReg)) {
      // Strategy 1: Find .apply { block after PackageList — insert add() inside it
      const applyMatch = contents.match(/PackageList\(this\)\.packages\.apply\s*\{/);
      if (applyMatch) {
        const applyIdx = contents.indexOf(applyMatch[0]);
        const afterBrace = applyIdx + applyMatch[0].length;
        contents =
          contents.slice(0, afterBrace) +
          "\n              " + shortReg +
          contents.slice(afterBrace);
        console.log("[withDeviceSettings] Added DeviceSettingsPackage in .apply{} block");
      }
      // Strategy 2: Old style with mutable packages list + return
      else {
        const returnIdx = contents.indexOf("return packages");
        if (returnIdx > -1) {
          contents =
            contents.slice(0, returnIdx) +
            "      " + longReg + "\n      " +
            contents.slice(returnIdx);
          console.log("[withDeviceSettings] Added DeviceSettingsPackage before return");
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
      // For writing Settings.Secure values (granted via ADB companion app)
      "android.permission.WRITE_SECURE_SETTINGS",
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
