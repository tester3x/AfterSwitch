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
     * Write a single Settings.System value.
     * Requires WRITE_SETTINGS permission.
     * Falls back to direct ContentResolver write for Samsung custom settings
     * that aren't in Android's SETTINGS_TO_BACKUP whitelist (throws IllegalArgumentException).
     */
    // ======= TEMPORARY EXPERIMENT — remove after the capability run =======
    //
    // Decides ONE question: with WRITE_SECURE_SETTINGS granted, can this app
    // write a KNOWN EXISTING system key? That answer decides whether the
    // desktop companion must remain a live write bridge or can shrink to a
    // one-time permission-granting utility.
    //
    // Constrained on purpose: two namespaces, a hardcoded allowlist, reads
    // the current value and writes back THAT EXACT VALUE so observable
    // configuration cannot change, refuses absent keys so it can never
    // create one, returns a coarse status and never the value, no retry.
    private val DIAGNOSTIC_SECURE_KEYS = setOf(
        "long_press_timeout",
        "show_ime_with_hard_keyboard",
        "spell_checker_enabled"
    )
    private val DIAGNOSTIC_GLOBAL_KEYS = setOf(
        "window_animation_scale",
        "transition_animation_scale",
        "animator_duration_scale"
    )

    @ReactMethod
    fun diagnosticSameValueWrite(namespace: String, key: String, promise: Promise) {
        try {
            val allowed = when (namespace) {
                "secure" -> DIAGNOSTIC_SECURE_KEYS
                "global" -> DIAGNOSTIC_GLOBAL_KEYS
                else -> {
                    promise.resolve("error")
                    return
                }
            }
            if (!allowed.contains(key)) {
                promise.resolve("error")
                return
            }

            val granted = reactContext.checkSelfPermission(
                android.Manifest.permission.WRITE_SECURE_SETTINGS
            ) == android.content.pm.PackageManager.PERMISSION_GRANTED
            if (!granted) {
                promise.resolve("permission_missing")
                return
            }

            val resolver = reactContext.contentResolver
            val current = if (namespace == "secure") {
                Settings.Secure.getString(resolver, key)
            } else {
                Settings.Global.getString(resolver, key)
            }
            // Absent key: refuse. Writing here would CREATE a key, which is
            // exactly the false positive this diagnostic exists to avoid.
            if (current == null) {
                promise.resolve("key_not_present")
                return
            }

            // Write back the value just read. Nothing else is ever written.
            if (namespace == "secure") {
                Settings.Secure.putString(resolver, key, current)
            } else {
                Settings.Global.putString(resolver, key, current)
            }

            val after = if (namespace == "secure") {
                Settings.Secure.getString(resolver, key)
            } else {
                Settings.Global.getString(resolver, key)
            }
            if (after == current) {
                promise.resolve("same_value_write_succeeded")
            } else {
                promise.resolve("system_overrode")
            }
        } catch (e: SecurityException) {
            promise.resolve("security_exception")
        } catch (e: Exception) {
            promise.resolve("error")
        }
    }

    // ======= TEMPORARY EXPERIMENT -- changed-value round trip =============
    //
    // Decides the ONE question the same-value probe could not: with
    // WRITE_SECURE_SETTINGS held, can this app CHANGE a known existing value,
    // observe the change through a fresh read, and put the exact original
    // back? A same-value write may be a no-op the provider accepts trivially;
    // only a changed value exercises the path a real restore takes.
    //
    // Exactly two keys, one per restricted namespace. Nothing else is
    // reachable, on either side of the bridge.
    private val ROUNDTRIP_SECURE_KEYS = setOf("long_press_timeout")
    private val ROUNDTRIP_GLOBAL_KEYS = setOf("window_animation_scale")

    /**
     * CRASH-SAFE ROLLBACK JOURNAL.
     *
     * An in-memory variable is not enough: if the process dies between the
     * mutation and the restore, the changed setting is stranded with no
     * record of what it used to be. The journal is written and fsynced to
     * this package's private files directory BEFORE the mutation, and is
     * removed only after the restoration has been independently verified.
     *
     * It is never logged, rendered, transmitted, exported, or uploaded. It
     * lives in the diagnostic package's private storage, so uninstalling the
     * diagnostic package erases it -- which is why cleanup must refuse to
     * uninstall while an entry is still pending.
     */
    private val rollbackFile: java.io.File
        get() = java.io.File(reactContext.filesDir, "afterswitch-diagnostic-rollback.json")

    /** One round trip at a time, enforced below the UI. */
    private val roundTripInFlight = java.util.concurrent.atomic.AtomicBoolean(false)

    /** Any restoration failure blocks every further test in this process. */
    @Volatile private var restorationFailed = false

    /** Global may not run until Secure has finished with a verified outcome. */
    @Volatile private var secureRoundTripClean = false

    private fun readValue(namespace: String, key: String, resolver: ContentResolver): String? =
        if (namespace == "secure") Settings.Secure.getString(resolver, key)
        else Settings.Global.getString(resolver, key)

    private fun writeValue(namespace: String, key: String, value: String, resolver: ContentResolver) {
        if (namespace == "secure") Settings.Secure.putString(resolver, key, value)
        else Settings.Global.putString(resolver, key, value)
    }

    /** Synchronous, flushed to disk before returning. Never logged. */
    private fun writeJournal(namespace: String, key: String, original: String, state: String) {
        val obj = org.json.JSONObject()
        obj.put("namespace", namespace)
        obj.put("key", key)
        obj.put("original", original)
        obj.put("state", state)
        val bytes = obj.toString().toByteArray(Charsets.UTF_8)
        java.io.FileOutputStream(rollbackFile).use { out ->
            out.write(bytes)
            out.flush()
            // force(true) flushes data AND metadata; the journal must survive
            // process death, not merely reach the page cache.
            out.channel.force(true)
        }
    }

    private fun clearJournal() {
        rollbackFile.delete()
    }

    /**
     * The alternate value, chosen internally and never exposed.
     *
     * secure.long_press_timeout is a touch-and-hold delay in milliseconds.
     * The platform control offers exactly Short=400, Medium=1000, Long=1500,
     * so the rule is: take the first of those three that differs from the
     * original. The value written is always one the platform itself offers.
     *
     * global.window_animation_scale is an animation SPEED multiplier.
     * Developer options offers 0.5x / 1x / 1.5x / 2x / 5x / 10x, so the rule
     * is: use 1.0 unless the original already parses to 1.0, in which case
     * use 0.5. Zero is deliberately never chosen -- "off" disables animation
     * rather than changing its speed.
     *
     * Neither key touches security, accessibility, networking, input method,
     * or device administration. The visible effect of either is a slightly
     * different touch delay or animation speed, for under a second.
     *
     * Returns null when the present value is outside the documented valid
     * domain, i.e. present but not suitable for the test.
     */
    private fun alternateFor(key: String, original: String): String? = when (key) {
        "long_press_timeout" -> {
            val n = original.trim().toIntOrNull()
            if (n == null || n < 100 || n > 5000) null
            else listOf(400, 1000, 1500).first { it != n }.toString()
        }
        "window_animation_scale" -> {
            val f = original.trim().toFloatOrNull()
            if (f == null || f < 0f || f > 10f) null
            else if (f == 1.0f) "0.5" else "1.0"
        }
        else -> null
    }

    /**
     * Read -> validate -> journal -> change -> verify -> restore -> verify.
     *
     * Returns one coarse status and nothing else. No value, no key, no
     * exception text ever crosses the bridge.
     */
    @ReactMethod
    fun diagnosticRoundTrip(namespace: String, key: String, promise: Promise) {
        // Single flight. A second concurrent call never touches a setting.
        if (!roundTripInFlight.compareAndSet(false, true)) {
            promise.resolve("error")
            return
        }

        var outcome: String? = null
        var original: String? = null
        var mutationAttempted = false
        var journalWritten = false
        var reachedTest = false

        try {
            // A restoration failure in this process, or a journal surviving
            // from a previous one, blocks every further test.
            if (restorationFailed || rollbackFile.exists()) {
                outcome = "restore_failed_stop_immediately"
                return
            }

            val allowed = when (namespace) {
                "secure" -> ROUNDTRIP_SECURE_KEYS
                "global" -> ROUNDTRIP_GLOBAL_KEYS
                else -> {
                    outcome = "error"
                    return
                }
            }
            if (!allowed.contains(key)) {
                outcome = "error"
                return
            }
            // Global does not run while Secure restoration is unverified.
            if (namespace == "global" && !secureRoundTripClean) {
                outcome = "error"
                return
            }
            reachedTest = true

            val granted = reactContext.checkSelfPermission(
                android.Manifest.permission.WRITE_SECURE_SETTINGS
            ) == android.content.pm.PackageManager.PERMISSION_GRANTED
            if (!granted) {
                outcome = "permission_missing"
                return
            }

            val resolver = reactContext.contentResolver
            val current = readValue(namespace, key, resolver)
            // Absent: refuse before any write, so no row is ever created.
            if (current == null) {
                outcome = "key_not_present"
                return
            }

            val alternate = alternateFor(key, current)
            if (alternate == null || alternate == current) {
                // Present but outside the documented valid domain, so no safe
                // distinct alternate exists. Nothing is written.
                outcome = "error"
                return
            }

            // Journal first, fsynced, THEN mutate. Process death after this
            // line leaves a recoverable record instead of a stranded setting.
            writeJournal(namespace, key, current, "pending")
            journalWritten = true
            original = current

            mutationAttempted = true
            writeValue(namespace, key, alternate, resolver)

            // Fresh read from the provider, not the write's own return value.
            val after = readValue(namespace, key, resolver)
            outcome = if (after == alternate) "round_trip_succeeded"
                      else "change_not_persisted_original_restored"
        } catch (e: SecurityException) {
            outcome = if (mutationAttempted) "change_write_failed_original_intact"
                      else "permission_missing"
        } catch (e: Exception) {
            outcome = "error"
        } finally {
            // RESTORE IN FINALLY. Runs on every exit path, including the
            // exception paths, and is a harmless no-op when the change write
            // itself threw.
            var restoreOk = true
            val toRestore = original
            if (toRestore != null) {
                restoreOk = false
                try {
                    val resolver = reactContext.contentResolver
                    writeValue(namespace, key, toRestore, resolver)
                    // Independent fresh read. Exact match or nothing.
                    restoreOk = readValue(namespace, key, resolver) == toRestore
                } catch (e: Exception) {
                    restoreOk = false
                }
            }

            if (!restoreOk) {
                // Keep the journal: it is the only thing that can finish the
                // restoration on the next launch.
                restorationFailed = true
                secureRoundTripClean = false
                outcome = "restore_failed_stop_immediately"
            } else {
                if (journalWritten && toRestore != null) {
                    // Mark verified, then remove. A crash inside this window
                    // leaves a 'verified' journal, which recovery discards.
                    try { writeJournal(namespace, key, toRestore, "verified") } catch (e: Exception) { }
                    clearJournal()
                }
                if (outcome == null) outcome = "error"
                if (mutationAttempted &&
                    outcome != "round_trip_succeeded" &&
                    outcome != "change_not_persisted_original_restored" &&
                    outcome != "change_write_failed_original_intact") {
                    outcome = "restore_succeeded_after_test_failure"
                }
                if (namespace == "secure" && reachedTest) {
                    secureRoundTripClean = true
                }
            }

            promise.resolve(outcome ?: "error")
            roundTripInFlight.set(false)
        }
    }

    /**
     * Startup recovery. Must run before any test becomes available.
     *
     * A journal that exists but cannot be parsed, or names something off the
     * allowlist, is NOT treated as absent -- it blocks instead.
     */
    @ReactMethod
    fun diagnosticRecoverPendingRollback(promise: Promise) {
        try {
            if (!rollbackFile.exists()) {
                promise.resolve("no_pending_rollback")
                return
            }

            val obj = try {
                org.json.JSONObject(rollbackFile.readText(Charsets.UTF_8))
            } catch (e: Exception) {
                null
            }
            if (obj == null) {
                restorationFailed = true
                promise.resolve("pending_rollback_restore_failed")
                return
            }

            val state = obj.optString("state")
            val namespace = obj.optString("namespace")
            val key = obj.optString("key")
            val original = if (obj.has("original")) obj.optString("original") else null

            if (state == "verified") {
                // Restoration already completed; only the file outlived it.
                clearJournal()
                promise.resolve("no_pending_rollback")
                return
            }

            val allowed = when (namespace) {
                "secure" -> ROUNDTRIP_SECURE_KEYS
                "global" -> ROUNDTRIP_GLOBAL_KEYS
                else -> null
            }
            if (state != "pending" || allowed == null || !allowed.contains(key) || original == null) {
                restorationFailed = true
                promise.resolve("pending_rollback_restore_failed")
                return
            }

            val granted = reactContext.checkSelfPermission(
                android.Manifest.permission.WRITE_SECURE_SETTINGS
            ) == android.content.pm.PackageManager.PERMISSION_GRANTED
            if (!granted) {
                restorationFailed = true
                promise.resolve("permission_missing")
                return
            }

            val resolver = reactContext.contentResolver
            if (readValue(namespace, key, resolver) != original) {
                writeValue(namespace, key, original, resolver)
            }
            if (readValue(namespace, key, resolver) == original) {
                writeJournal(namespace, key, original, "verified")
                clearJournal()
                promise.resolve("pending_rollback_restored")
            } else {
                restorationFailed = true
                promise.resolve("pending_rollback_restore_failed")
            }
        } catch (e: Exception) {
            restorationFailed = true
            promise.resolve("error")
        }
    }

    /**
     * Presence only -- never the namespace, key, or value. Cleanup and the UI
     * use this to refuse to proceed while a rollback is outstanding.
     */
    @ReactMethod
    fun diagnosticRollbackPending(promise: Promise) {
        promise.resolve(rollbackFile.exists() || restorationFailed)
    }
    // ======= END TEMPORARY EXPERIMENT ====================================

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
