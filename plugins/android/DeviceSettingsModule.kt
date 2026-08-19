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
        // PERMISSION ONLY. This reports whether WRITE_SECURE_SETTINGS is held.
        // It does NOT report whether a known system key can actually be
        // written; on Android 12+ those are different questions and only a
        // device experiment can answer the second one.
        //
        // The previous implementation wrote "afterswitch_permission_test" into
        // Settings.Secure and treated success as proof. That was misleading in
        // the worst way: Android 12+ SettingsProvider permits an app to create
        // arbitrary NEW keys while refusing writes to known system keys. So the
        // probe succeeded exactly when it mattered least, reported "capable",
        // and left a stray key behind. A capability check must not mutate.
        try {
            val granted = reactContext.checkSelfPermission(
                android.Manifest.permission.WRITE_SECURE_SETTINGS
            ) == android.content.pm.PackageManager.PERMISSION_GRANTED
            promise.resolve(granted)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    // ==================== WRITE METHODS ====================

    /**
     * NATIVE ALLOWLIST MIRROR.
     *
     * The JavaScript side has its own allowlist in src/data/restoreAllowlist.ts
     * and refuses anything not on it. This is a SECOND, INDEPENDENT gate that
     * assumes the first one is broken: a JS regression, a tampered bundle, or
     * a future caller that forgets the planner still cannot write a key that
     * is not listed here.
     *
     * The two lists are asserted identical by scripts/test-bounded-restore.mjs.
     * It holds the WRITABLE set only -- the JS 'auto' tier. Guided and
     * unsupported entries are never sent here, so mirroring them would make
     * native laxer than JS, and promoting a key to automatic must touch both
     * sides on purpose.
     *
     * Entries are exact "namespace.key" pairs. No prefixes, no wildcards.
     */
    private val RESTORE_ALLOWLIST = setOf(
        "secure.long_press_timeout",
        "global.window_animation_scale"
    )

    private fun isAllowlisted(namespace: String, key: String): Boolean =
        RESTORE_ALLOWLIST.contains("$namespace.$key")

    /**
     * Coarse write outcomes. No setting value and no exception text is ever
     * returned, so a result can be rendered or logged without leaking a
     * value:
     *
     *   write_succeeded    written, and a FRESH READ matched
     *   write_failed       attempted; the fresh read did not match, or the
     *                      provider refused
     *   key_not_present    no row existed, and this never creates one
     *   not_allowlisted    the namespace/key pair is not on the mirror
     *   unsupported_value  the value is empty or absurdly long
     *   permission_missing the required permission is not held
     */
    private fun writeChecked(
        namespace: String,
        uri: Uri,
        key: String,
        value: String,
        read: () -> String?,
        put: () -> Unit,
    ): String {
        if (!isAllowlisted(namespace, key)) return "not_allowlisted"
        if (value.isBlank() || value.length > 256) return "unsupported_value"

        // A key with no row is NOT created. The provider `insert` that used to
        // back the System fallback could mint a novel SettingsProvider row,
        // which is how a restore could invent settings the device never had.
        if (read() == null) return "key_not_present"

        return try {
            put()
            // Fresh read from the provider, not the return of the write.
            if (read() == value) "write_succeeded" else {
                // Second attempt via a direct UPDATE, for OEM keys the
                // framework helper refuses. Still update-only: it can change a
                // row that exists and can never create one.
                val updated = updateExistingRow(uri, key, value)
                if (updated && read() == value) "write_succeeded" else "write_failed"
            }
        } catch (e: SecurityException) {
            "permission_missing"
        } catch (e: IllegalArgumentException) {
            val updated = try { updateExistingRow(uri, key, value) } catch (e2: Exception) { false }
            if (updated && read() == value) "write_succeeded" else "write_failed"
        } catch (e: Exception) {
            "write_failed"
        }
    }

    /**
     * UPDATE ONLY. Returns false when no row matched, and never inserts.
     *
     * The previous version fell back to `insert` when `update` matched zero
     * rows, so writing an unknown key created it. Nothing here can add a row
     * to the settings database.
     */
    private fun updateExistingRow(uri: Uri, key: String, value: String): Boolean {
        val cv = ContentValues(2).apply {
            put("name", key)
            put("value", value)
        }
        return reactContext.contentResolver.update(uri, cv, "name = ?", arrayOf(key)) > 0
    }

    /**
     * Write a single Settings.System value. Requires WRITE_SETTINGS.
     * Resolves a coarse status string -- never a boolean, never a value.
     */
    @ReactMethod
    fun writeSystemSetting(key: String, value: String, promise: Promise) {
        if (!isAllowlisted("system", key)) {
            promise.resolve("not_allowlisted")
            return
        }
        if (!Settings.System.canWrite(reactContext)) {
            promise.resolve("permission_missing")
            return
        }
        val resolver = reactContext.contentResolver
        promise.resolve(
            writeChecked(
                "system", Settings.System.CONTENT_URI, key, value,
                read = { Settings.System.getString(resolver, key) },
                put = { Settings.System.putString(resolver, key, value) },
            )
        )
    }

    /**
     * Write a single Settings.Secure value. Requires WRITE_SECURE_SETTINGS.
     */
    @ReactMethod
    fun writeSecureSetting(key: String, value: String, promise: Promise) {
        if (!isAllowlisted("secure", key)) {
            promise.resolve("not_allowlisted")
            return
        }
        if (!hasSecureWritePermission()) {
            promise.resolve("permission_missing")
            return
        }
        val resolver = reactContext.contentResolver
        promise.resolve(
            writeChecked(
                "secure", Settings.Secure.CONTENT_URI, key, value,
                read = { Settings.Secure.getString(resolver, key) },
                put = { Settings.Secure.putString(resolver, key, value) },
            )
        )
    }

    /**
     * Write a single Settings.Global value. Requires WRITE_SECURE_SETTINGS.
     */
    @ReactMethod
    fun writeGlobalSetting(key: String, value: String, promise: Promise) {
        if (!isAllowlisted("global", key)) {
            promise.resolve("not_allowlisted")
            return
        }
        if (!hasSecureWritePermission()) {
            promise.resolve("permission_missing")
            return
        }
        val resolver = reactContext.contentResolver
        promise.resolve(
            writeChecked(
                "global", Settings.Global.CONTENT_URI, key, value,
                read = { Settings.Global.getString(resolver, key) },
                put = { Settings.Global.putString(resolver, key, value) },
            )
        )
    }

    private fun hasSecureWritePermission(): Boolean =
        reactContext.checkSelfPermission(
            android.Manifest.permission.WRITE_SECURE_SETTINGS
        ) == android.content.pm.PackageManager.PERMISSION_GRANTED

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

    // writeSettingDirect() was REMOVED. It used an update-then-INSERT pattern,
    // so writing a key with no existing row CREATED one -- a restore could mint
    // SettingsProvider rows the device never had. updateExistingRow() above
    // replaces it and can only ever change a row that already exists.

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
