package com.afterswitch.app

import android.content.ContentResolver
import android.content.ContentValues
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

/**
 * Native module for reading and writing Android device settings.
 *
 * READING: All Settings.System/Secure/Global can be read without special permissions
 * by iterating the content provider cursor.
 *
 * WRITING:
 * - Settings.System: requires WRITE_SETTINGS (user-grantable via system dialog)
 * - Settings.Secure: requires WRITE_SECURE_SETTINGS (granted via ADB only)
 * - Settings.Global: requires WRITE_SECURE_SETTINGS (granted via ADB only)
 */
class DeviceSettingsModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "DeviceSettings"

    companion object {
        private const val TAG = "DeviceSettings"
    }

    // ==================== READ METHODS ====================

    /**
     * Read ALL Settings.System key-value pairs via content resolver cursor.
     * No special permissions needed.
     */
    @ReactMethod
    fun getSystemSettings(promise: Promise) {
        try {
            val map = readSettingsProvider(Settings.System.CONTENT_URI)
            promise.resolve(map)
        } catch (e: Exception) {
            Log.e(TAG, "getSystemSettings failed: ${e.message}")
            promise.reject("SYSTEM_READ_ERROR", "Failed to read system settings: ${e.message}", e)
        }
    }

    /**
     * Read ALL Settings.Secure key-value pairs via content resolver cursor.
     * No special permissions needed for reading.
     */
    @ReactMethod
    fun getSecureSettings(promise: Promise) {
        try {
            val map = readSettingsProvider(Settings.Secure.CONTENT_URI)
            promise.resolve(map)
        } catch (e: Exception) {
            Log.e(TAG, "getSecureSettings failed: ${e.message}")
            promise.reject("SECURE_READ_ERROR", "Failed to read secure settings: ${e.message}", e)
        }
    }

    /**
     * Read ALL Settings.Global key-value pairs via content resolver cursor.
     * No special permissions needed for reading.
     */
    @ReactMethod
    fun getGlobalSettings(promise: Promise) {
        try {
            val map = readSettingsProvider(Settings.Global.CONTENT_URI)
            promise.resolve(map)
        } catch (e: Exception) {
            Log.e(TAG, "getGlobalSettings failed: ${e.message}")
            promise.reject("GLOBAL_READ_ERROR", "Failed to read global settings: ${e.message}", e)
        }
    }

    /**
     * Get device hardware and software info.
     */
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

            // Device name (user-set)
            val deviceName = Settings.Global.getString(reactContext.contentResolver, Settings.Global.DEVICE_NAME)
            map.putString("deviceName", deviceName ?: Build.MODEL)

            // Detect Samsung One UI version via reflection
            val oneUiVersion = detectOneUiVersion()
            if (oneUiVersion != null) {
                map.putString("oneUiVersion", oneUiVersion)
            } else {
                map.putNull("oneUiVersion")
            }

            promise.resolve(map)
        } catch (e: Exception) {
            Log.e(TAG, "getDeviceInfo failed: ${e.message}")
            promise.reject("DEVICE_INFO_ERROR", "Failed to get device info: ${e.message}", e)
        }
    }

    /**
     * Get all installed applications with metadata.
     * Requires QUERY_ALL_PACKAGES on Android 11+ for full list.
     */
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
            Log.e(TAG, "getInstalledApps failed: ${e.message}")
            promise.reject("APPS_READ_ERROR", "Failed to get installed apps: ${e.message}", e)
        }
    }

    /**
     * Get default app handlers (browser, SMS, dialer, launcher, camera, keyboard).
     */
    @ReactMethod
    fun getDefaultApps(promise: Promise) {
        try {
            val pm = reactContext.packageManager
            val map = Arguments.createMap()

            // Default browser
            resolveDefaultApp(pm, Intent(Intent.ACTION_VIEW, Uri.parse("https://example.com")))?.let {
                map.putMap("browser", it)
            } ?: map.putNull("browser")

            // Default SMS
            resolveDefaultApp(pm, Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:")))?.let {
                map.putMap("sms", it)
            } ?: map.putNull("sms")

            // Default dialer
            resolveDefaultApp(pm, Intent(Intent.ACTION_DIAL, Uri.parse("tel:")))?.let {
                map.putMap("dialer", it)
            } ?: map.putNull("dialer")

            // Default launcher
            val launcherIntent = Intent(Intent.ACTION_MAIN).apply {
                addCategory(Intent.CATEGORY_HOME)
            }
            resolveDefaultApp(pm, launcherIntent)?.let {
                map.putMap("launcher", it)
            } ?: map.putNull("launcher")

            // Default camera
            resolveDefaultApp(pm, Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE))?.let {
                map.putMap("camera", it)
            } ?: map.putNull("camera")

            // Default keyboard (from Settings.Secure)
            val keyboardComponent = Settings.Secure.getString(
                reactContext.contentResolver,
                Settings.Secure.DEFAULT_INPUT_METHOD
            )
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
            Log.e(TAG, "getDefaultApps failed: ${e.message}")
            promise.reject("DEFAULTS_READ_ERROR", "Failed to get default apps: ${e.message}", e)
        }
    }

    /**
     * Read Samsung-specific settings from all three providers.
     * Filters for keys containing "samsung", "sem_", "oneui", or known Samsung prefixes.
     */
    @ReactMethod
    fun getSamsungSettings(promise: Promise) {
        try {
            val map = Arguments.createMap()

            if (!Build.MANUFACTURER.equals("samsung", ignoreCase = true)) {
                promise.resolve(map)
                return
            }

            val samsungPrefixes = listOf(
                "samsung", "sem_", "oneui", "spen_", "edge_",
                "multi_window", "air_", "smart_", "bixby",
                "aod_", "motion_", "navigation_mode",
                "show_button_background", "key_home"
            )

            // Scan all three providers for Samsung-specific keys
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
            Log.e(TAG, "getSamsungSettings failed: ${e.message}")
            promise.reject("SAMSUNG_READ_ERROR", "Failed to read Samsung settings: ${e.message}", e)
        }
    }

    // ==================== PERMISSION CHECKS ====================

    /**
     * Check if the app has WRITE_SETTINGS permission (for Settings.System writes).
     */
    @ReactMethod
    fun canWriteSettings(promise: Promise) {
        promise.resolve(Settings.System.canWrite(reactContext))
    }

    /**
     * Open the system permission screen for WRITE_SETTINGS.
     * User must manually toggle the switch.
     */
    @ReactMethod
    fun requestWritePermission(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS).apply {
                data = Uri.parse("package:${reactContext.packageName}")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("PERMISSION_ERROR", "Failed to open write settings: ${e.message}", e)
        }
    }

    /**
     * Check if WRITE_SECURE_SETTINGS is granted (via ADB companion).
     * Tests by attempting to read a known secure setting — if we can also write,
     * the permission is granted.
     */
    @ReactMethod
    fun canWriteSecureSettings(promise: Promise) {
        try {
            // Try writing a harmless value and reverting it
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

    // ==================== WRITE METHODS ====================

    /**
     * Write a single Settings.System value.
     * Requires WRITE_SETTINGS permission.
     * Falls back to direct ContentResolver write for Samsung custom settings
     * that aren't in Android's SETTINGS_TO_BACKUP whitelist (throws IllegalArgumentException).
     */
    @ReactMethod
    fun writeSystemSetting(key: String, value: String, promise: Promise) {
        try {
            if (!Settings.System.canWrite(reactContext)) {
                promise.reject("NO_PERMISSION", "WRITE_SETTINGS permission not granted")
                return
            }
            Settings.System.putString(reactContext.contentResolver, key, value)

            // Verify the write actually persisted (Android silently blocks non-whitelisted settings)
            val readBack = Settings.System.getString(reactContext.contentResolver, key)
            if (readBack == value) {
                Log.d(TAG, "Wrote system setting: $key = $value")
                promise.resolve(true)
            } else {
                // putString didn't throw but the value didn't stick — try direct ContentResolver
                Log.w(TAG, "putString silent fail for $key (got $readBack, wanted $value), trying direct")
                writeSettingDirect(Settings.System.CONTENT_URI, key, value)
                val readBack2 = Settings.System.getString(reactContext.contentResolver, key)
                if (readBack2 == value) {
                    Log.d(TAG, "Wrote system setting via ContentResolver: $key = $value")
                    promise.resolve(true)
                } else {
                    Log.w(TAG, "System setting $key is OS-restricted (write silently blocked)")
                    promise.resolve(false)
                }
            }
        } catch (e: IllegalArgumentException) {
            // Samsung custom setting not in Android whitelist — try direct ContentResolver
            Log.w(TAG, "putString blocked for $key, trying direct ContentResolver")
            try {
                writeSettingDirect(Settings.System.CONTENT_URI, key, value)
                val readBack = Settings.System.getString(reactContext.contentResolver, key)
                if (readBack == value) {
                    Log.d(TAG, "Wrote system setting via ContentResolver: $key = $value")
                    promise.resolve(true)
                } else {
                    Log.w(TAG, "System setting $key is OS-restricted")
                    promise.resolve(false)
                }
            } catch (e2: Exception) {
                Log.e(TAG, "Direct write also failed for $key: ${e2.message}")
                promise.resolve(false)
            }
        } catch (e: Exception) {
            Log.e(TAG, "writeSystemSetting failed: ${e.message}")
            promise.resolve(false)
        }
    }

    /**
     * Write a single Settings.Secure value.
     * Requires WRITE_SECURE_SETTINGS (granted via ADB companion).
     */
    @ReactMethod
    fun writeSecureSetting(key: String, value: String, promise: Promise) {
        try {
            Settings.Secure.putString(reactContext.contentResolver, key, value)
            // Verify write persisted
            val readBack = Settings.Secure.getString(reactContext.contentResolver, key)
            if (readBack == value) {
                Log.d(TAG, "Wrote secure setting: $key = $value")
                promise.resolve(true)
            } else {
                Log.w(TAG, "Secure setting $key write didn't persist (got $readBack, wanted $value)")
                promise.resolve(false)
            }
        } catch (e: SecurityException) {
            Log.w(TAG, "Secure setting $key: no permission")
            promise.resolve(false)
        } catch (e: Exception) {
            Log.e(TAG, "writeSecureSetting failed: ${e.message}")
            promise.resolve(false)
        }
    }

    /**
     * Write a single Settings.Global value.
     * Requires WRITE_SECURE_SETTINGS (granted via ADB companion).
     */
    @ReactMethod
    fun writeGlobalSetting(key: String, value: String, promise: Promise) {
        try {
            Settings.Global.putString(reactContext.contentResolver, key, value)
            // Verify write persisted
            val readBack = Settings.Global.getString(reactContext.contentResolver, key)
            if (readBack == value) {
                Log.d(TAG, "Wrote global setting: $key = $value")
                promise.resolve(true)
            } else {
                Log.w(TAG, "Global setting $key write didn't persist (got $readBack, wanted $value)")
                promise.resolve(false)
            }
        } catch (e: SecurityException) {
            Log.w(TAG, "Global setting $key: no permission")
            promise.resolve(false)
        } catch (e: Exception) {
            Log.e(TAG, "writeGlobalSetting failed: ${e.message}")
            promise.resolve(false)
        }
    }

    /**
     * Open a specific Android Settings screen via intent action.
     */
    @ReactMethod
    fun openSettingsScreen(action: String, promise: Promise) {
        try {
            val intent = Intent(action).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            // Fallback to main settings
            try {
                val fallback = Intent(Settings.ACTION_SETTINGS).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                reactContext.startActivity(fallback)
                promise.resolve(true)
            } catch (e2: Exception) {
                promise.reject("SETTINGS_ERROR", "Failed to open settings: ${e2.message}", e2)
            }
        }
    }

    // ==================== HELPERS ====================

    /**
     * Read all key-value pairs from a Settings content provider URI.
     * This iterates the cursor to capture EVERY setting, including undocumented
     * Samsung-specific keys that don't appear in the Android SDK docs.
     */
    private fun readSettingsProvider(uri: Uri): WritableMap {
        val map = Arguments.createMap()
        val cursor = reactContext.contentResolver.query(
            uri,
            arrayOf("name", "value"),
            null, null, null
        )
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
        Log.d(TAG, "Read ${map.toHashMap().size} entries from $uri")
        return map
    }

    /**
     * Resolve the default app for a given intent.
     * Returns a map with packageName and label, or null if no default is set.
     */
    private fun resolveDefaultApp(pm: PackageManager, intent: Intent): WritableMap? {
        val resolveInfo = pm.resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY)
            ?: return null

        val pkgName = resolveInfo.activityInfo?.packageName ?: return null

        // Filter out Android's resolver/chooser — means no default is set
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

    /**
     * Write a setting directly via ContentResolver, bypassing the high-level
     * Settings.System.putString whitelist. Uses update-then-insert pattern.
     * Requires appropriate write permission (WRITE_SETTINGS or WRITE_SECURE_SETTINGS).
     */
    private fun writeSettingDirect(uri: Uri, key: String, value: String) {
        val cv = ContentValues(2).apply {
            put("name", key)
            put("value", value)
        }
        val updated = reactContext.contentResolver.update(
            uri, cv, "name = ?", arrayOf(key)
        )
        if (updated == 0) {
            reactContext.contentResolver.insert(uri, cv)
        }
    }

    /**
     * Detect Samsung One UI version via reflection on SemPlatformInt.
     * Returns human-readable version string (e.g., "6.1") or null if not Samsung.
     */
    private fun detectOneUiVersion(): String? {
        if (!Build.MANUFACTURER.equals("samsung", ignoreCase = true)) return null

        try {
            val field = Build.VERSION::class.java.getDeclaredField("SEM_PLATFORM_INT")
            field.isAccessible = true
            val semPlatformInt = field.getInt(null)

            // SEM_PLATFORM_INT encoding: major * 10000 + minor * 100
            // e.g., 60100 = One UI 6.1, 50100 = One UI 5.1
            if (semPlatformInt > 0) {
                val major = semPlatformInt / 10000
                val minor = (semPlatformInt % 10000) / 100
                return "$major.$minor"
            }
        } catch (e: Exception) {
            Log.d(TAG, "Could not detect One UI version: ${e.message}")
        }

        return null
    }
}
