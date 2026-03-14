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

// Inline Kotlin source — fallback if file copy fails on EAS
const DEVICE_SETTINGS_PACKAGE_KT = `package com.afterswitch.app

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class DeviceSettingsPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(DeviceSettingsModule(reactContext))
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
`;

const DEVICE_SETTINGS_MODULE_KT = `package com.afterswitch.app

import android.content.ContentResolver
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap

class DeviceSettingsModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "DeviceSettings"

    companion object {
        private const val TAG = "DeviceSettings"
    }

    @ReactMethod
    fun getSystemSettings(promise: Promise) {
        try {
            val map = readSettingsProvider(Settings.System.CONTENT_URI)
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("SYSTEM_READ_ERROR", "Failed to read system settings: \${e.message}", e)
        }
    }

    @ReactMethod
    fun getSecureSettings(promise: Promise) {
        try {
            val map = readSettingsProvider(Settings.Secure.CONTENT_URI)
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("SECURE_READ_ERROR", "Failed to read secure settings: \${e.message}", e)
        }
    }

    @ReactMethod
    fun getGlobalSettings(promise: Promise) {
        try {
            val map = readSettingsProvider(Settings.Global.CONTENT_URI)
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("GLOBAL_READ_ERROR", "Failed to read global settings: \${e.message}", e)
        }
    }

    @ReactMethod
    fun getDeviceInfo(promise: Promise) {
        try {
            val map = Arguments.createMap()
            map.putString("manufacturer", Build.MANUFACTURER)
            map.putString("brand", Build.BRAND)
            map.putString("model", Build.MODEL)
            map.putString("device", Build.DEVICE)
            map.putString("product", Build.PRODUCT)
            map.putString("osVersion", Build.VERSION.RELEASE)
            map.putInt("sdkInt", Build.VERSION.SDK_INT)
            map.putString("securityPatch", Build.VERSION.SECURITY_PATCH)
            map.putString("display", Build.DISPLAY)
            val deviceName = Settings.Global.getString(reactContext.contentResolver, Settings.Global.DEVICE_NAME)
            map.putString("deviceName", deviceName ?: Build.MODEL)
            val oneUiVersion = detectOneUiVersion()
            if (oneUiVersion != null) {
                map.putString("oneUiVersion", oneUiVersion)
            } else {
                map.putNull("oneUiVersion")
            }
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("DEVICE_INFO_ERROR", "Failed to get device info: \${e.message}", e)
        }
    }

    @ReactMethod
    fun getInstalledApps(includeSystem: Boolean, promise: Promise) {
        try {
            val pm = reactContext.packageManager
            val apps = pm.getInstalledApplications(PackageManager.GET_META_DATA)
            val result = Arguments.createArray()
            for (app in apps) {
                val isSystem = (app.flags and ApplicationInfo.FLAG_SYSTEM) != 0
                if (!includeSystem && isSystem) continue
                val appMap = Arguments.createMap()
                appMap.putString("packageName", app.packageName)
                appMap.putString("label", pm.getApplicationLabel(app).toString())
                appMap.putBoolean("isSystemApp", isSystem)
                try {
                    val packageInfo = pm.getPackageInfo(app.packageName, 0)
                    appMap.putString("versionName", packageInfo.versionName ?: "")
                } catch (e: Exception) {
                    appMap.putString("versionName", "")
                }
                result.pushMap(appMap)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("APPS_READ_ERROR", "Failed to get installed apps: \${e.message}", e)
        }
    }

    @ReactMethod
    fun getDefaultApps(promise: Promise) {
        try {
            val pm = reactContext.packageManager
            val map = Arguments.createMap()
            resolveDefaultApp(pm, Intent(Intent.ACTION_VIEW, Uri.parse("https://example.com")))?.let {
                map.putMap("browser", it)
            } ?: map.putNull("browser")
            resolveDefaultApp(pm, Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:")))?.let {
                map.putMap("sms", it)
            } ?: map.putNull("sms")
            resolveDefaultApp(pm, Intent(Intent.ACTION_DIAL, Uri.parse("tel:")))?.let {
                map.putMap("dialer", it)
            } ?: map.putNull("dialer")
            val launcherIntent = Intent(Intent.ACTION_MAIN).apply { addCategory(Intent.CATEGORY_HOME) }
            resolveDefaultApp(pm, launcherIntent)?.let {
                map.putMap("launcher", it)
            } ?: map.putNull("launcher")
            resolveDefaultApp(pm, Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE))?.let {
                map.putMap("camera", it)
            } ?: map.putNull("camera")
            val keyboardComponent = Settings.Secure.getString(reactContext.contentResolver, Settings.Secure.DEFAULT_INPUT_METHOD)
            if (keyboardComponent != null) {
                val keyboardMap = Arguments.createMap()
                val pkgName = keyboardComponent.split("/").firstOrNull() ?: keyboardComponent
                keyboardMap.putString("packageName", pkgName)
                try {
                    val appInfo = pm.getApplicationInfo(pkgName, 0)
                    keyboardMap.putString("label", pm.getApplicationLabel(appInfo).toString())
                } catch (e: Exception) {
                    keyboardMap.putString("label", pkgName)
                }
                map.putMap("keyboard", keyboardMap)
            } else {
                map.putNull("keyboard")
            }
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("DEFAULTS_READ_ERROR", "Failed to get default apps: \${e.message}", e)
        }
    }

    @ReactMethod
    fun getSamsungSettings(promise: Promise) {
        try {
            val map = Arguments.createMap()
            if (!Build.MANUFACTURER.equals("samsung", ignoreCase = true)) {
                promise.resolve(map)
                return
            }
            val samsungPrefixes = listOf("samsung", "sem_", "oneui", "spen_", "edge_", "multi_window", "air_", "smart_", "bixby", "aod_", "motion_", "navigation_mode", "show_button_background", "key_home")
            for (uri in listOf(Settings.System.CONTENT_URI, Settings.Secure.CONTENT_URI, Settings.Global.CONTENT_URI)) {
                val cursor = reactContext.contentResolver.query(uri, arrayOf("name", "value"), null, null, null)
                cursor?.use {
                    val nameIdx = it.getColumnIndex("name")
                    val valueIdx = it.getColumnIndex("value")
                    if (nameIdx < 0 || valueIdx < 0) return@use
                    while (it.moveToNext()) {
                        val name = it.getString(nameIdx) ?: continue
                        val value = it.getString(valueIdx) ?: ""
                        val nameLower = name.lowercase()
                        if (samsungPrefixes.any { prefix -> nameLower.contains(prefix) }) {
                            map.putString(name, value)
                        }
                    }
                }
            }
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("SAMSUNG_READ_ERROR", "Failed to read Samsung settings: \${e.message}", e)
        }
    }

    @ReactMethod
    fun canWriteSettings(promise: Promise) {
        promise.resolve(Settings.System.canWrite(reactContext))
    }

    @ReactMethod
    fun requestWritePermission(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS).apply {
                data = Uri.parse("package:\${reactContext.packageName}")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("PERMISSION_ERROR", "Failed to open write settings: \${e.message}", e)
        }
    }

    @ReactMethod
    fun canWriteSecureSettings(promise: Promise) {
        try {
            val testKey = "afterswitch_permission_test"
            Settings.Secure.putString(reactContext.contentResolver, testKey, "1")
            Settings.Secure.putString(reactContext.contentResolver, testKey, null)
            promise.resolve(true)
        } catch (e: SecurityException) {
            promise.resolve(false)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun writeSystemSetting(key: String, value: String, promise: Promise) {
        try {
            if (!Settings.System.canWrite(reactContext)) {
                promise.reject("NO_PERMISSION", "WRITE_SETTINGS permission not granted")
                return
            }
            Settings.System.putString(reactContext.contentResolver, key, value)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("WRITE_ERROR", "Failed to write system setting: \${e.message}", e)
        }
    }

    @ReactMethod
    fun writeSecureSetting(key: String, value: String, promise: Promise) {
        try {
            Settings.Secure.putString(reactContext.contentResolver, key, value)
            promise.resolve(true)
        } catch (e: SecurityException) {
            promise.reject("NO_PERMISSION", "WRITE_SECURE_SETTINGS not granted. Use the desktop companion to unlock.")
        } catch (e: Exception) {
            promise.reject("WRITE_ERROR", "Failed to write secure setting: \${e.message}", e)
        }
    }

    @ReactMethod
    fun writeGlobalSetting(key: String, value: String, promise: Promise) {
        try {
            Settings.Global.putString(reactContext.contentResolver, key, value)
            promise.resolve(true)
        } catch (e: SecurityException) {
            promise.reject("NO_PERMISSION", "WRITE_SECURE_SETTINGS not granted. Use the desktop companion to unlock.")
        } catch (e: Exception) {
            promise.reject("WRITE_ERROR", "Failed to write global setting: \${e.message}", e)
        }
    }

    @ReactMethod
    fun openSettingsScreen(action: String, promise: Promise) {
        try {
            val intent = Intent(action).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
            reactContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            try {
                val fallback = Intent(Settings.ACTION_SETTINGS).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
                reactContext.startActivity(fallback)
                promise.resolve(true)
            } catch (e2: Exception) {
                promise.reject("SETTINGS_ERROR", "Failed to open settings: \${e2.message}", e2)
            }
        }
    }

    private fun readSettingsProvider(uri: Uri): WritableMap {
        val map = Arguments.createMap()
        val cursor = reactContext.contentResolver.query(uri, arrayOf("name", "value"), null, null, null)
        cursor?.use {
            val nameIdx = it.getColumnIndex("name")
            val valueIdx = it.getColumnIndex("value")
            if (nameIdx < 0 || valueIdx < 0) return@use
            while (it.moveToNext()) {
                val name = it.getString(nameIdx) ?: continue
                val value = it.getString(valueIdx) ?: ""
                map.putString(name, value)
            }
        }
        return map
    }

    private fun resolveDefaultApp(pm: PackageManager, intent: Intent): WritableMap? {
        val resolveInfo = pm.resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY) ?: return null
        val pkgName = resolveInfo.activityInfo?.packageName ?: return null
        if (pkgName == "android" || pkgName == "com.android.internal.app") return null
        val map = Arguments.createMap()
        map.putString("packageName", pkgName)
        try {
            val appInfo = pm.getApplicationInfo(pkgName, 0)
            map.putString("label", pm.getApplicationLabel(appInfo).toString())
        } catch (e: Exception) {
            map.putString("label", pkgName)
        }
        return map
    }

    private fun detectOneUiVersion(): String? {
        if (!Build.MANUFACTURER.equals("samsung", ignoreCase = true)) return null
        try {
            val field = Build.VERSION::class.java.getDeclaredField("SEM_PLATFORM_INT")
            field.isAccessible = true
            val semPlatformInt = field.getInt(null)
            if (semPlatformInt > 0) {
                val major = semPlatformInt / 10000
                val minor = (semPlatformInt % 10000) / 100
                return "\$major.\$minor"
            }
        } catch (e: Exception) {
            Log.d(TAG, "Could not detect One UI version: \${e.message}")
        }
        return null
    }
}
`;

/**
 * Write Kotlin native module files into the android project.
 * Source is embedded inline to avoid path resolution issues on EAS build servers.
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

      // Try to copy from plugins/android/ first, fall back to inline source
      const pluginDir = path.join(__dirname, "android");
      const moduleSrc = path.join(pluginDir, "DeviceSettingsModule.kt");
      const packageSrc = path.join(pluginDir, "DeviceSettingsPackage.kt");

      if (fs.existsSync(moduleSrc) && fs.existsSync(packageSrc)) {
        fs.copyFileSync(moduleSrc, path.join(targetDir, "DeviceSettingsModule.kt"));
        fs.copyFileSync(packageSrc, path.join(targetDir, "DeviceSettingsPackage.kt"));
        console.log("[withDeviceSettings] Copied Kotlin files from plugins/android/");
      } else {
        console.log("[withDeviceSettings] plugins/android/ not found, writing inline source");
        fs.writeFileSync(path.join(targetDir, "DeviceSettingsPackage.kt"), DEVICE_SETTINGS_PACKAGE_KT);
        fs.writeFileSync(path.join(targetDir, "DeviceSettingsModule.kt"), DEVICE_SETTINGS_MODULE_KT);
        console.log("[withDeviceSettings] Wrote inline Kotlin files");
      }

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
