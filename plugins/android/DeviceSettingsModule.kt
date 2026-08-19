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

    // ======= TEMPORARY EXPERIMENT -- system-write matrix =================
    //
    // Answers, per key, the only question that qualifies a key for automatic
    // restore: can this app CHANGE the value, see the change through a fresh
    // read, and put the exact original back?
    //
    // The production allowlist in src/data/restoreAllowlist.ts is NOT touched
    // by any of this. These lists are the experiment's own, and the domains
    // below are deliberately the same ones the production validator enforces,
    // so a key proven here is proven inside the bounds it will later be
    // written under.
    //
    // Two namespaces of permission, and they are NOT the same grant:
    //   system.*  needs WRITE_SETTINGS  -- an appop, granted by the user
    //             through a system dialog or by `adb shell appops set`
    //   secure/global needs WRITE_SECURE_SETTINGS -- granted by `pm grant`
    // The earlier ADB grant covered only the second. canWriteSystemSettings()
    // below reports the first separately rather than assuming it.

    /** Ordered. Index N cannot run until index N-1 restored and verified. */
    /**
     * Distinguishes THIS build from the twelve-key one. The marker scanner
     * requires it, so an older artifact -- which cannot contain it -- fails
     * the gate instead of quietly passing because its superset of keys
     * happens to satisfy a two-key requirement.
     */
    private val MATRIX_BUILD_TAG = "afterswitch-matrix-round2"

    /**
     * ROUND 2. Only the two mutations the first run never reached.
     *
     * Keys 1-10 were completed and accepted from build 56a2b326, each with a
     * changed value, a fresh-read confirmation, an exact restoration and a
     * second fresh read. They are deliberately ABSENT here rather than
     * disabled: a key that is not in this list cannot be run at all, by any
     * path, so there is no way to repeat them by accident.
     */
    private val MATRIX_ORDER = listOf(
        "global.transition_animation_scale",
        // LAST ON PURPOSE. A font_scale write is a configuration change: the
        // activity is destroyed and recreated under the running round trip.
        // The whole trip -- journal, mutate, verify, restore, verify -- happens
        // inside one native call on the bridge thread, so recreation does not
        // split it, and the journal is fsynced before the mutation so even
        // process death leaves a recoverable record.
        "system.font_scale"
    )

    /** Non-mutating only. These two returned no row on the earlier run. */
    private val MATRIX_PROBES = listOf(
        "secure.spell_checker_enabled",
        "global.animator_duration_scale"
    )

    private val MATRIX_JOURNAL = "afterswitch-matrix-rollback.json"

    private val matrixInFlight = java.util.concurrent.atomic.AtomicBoolean(false)
    @Volatile private var matrixRestorationFailed = false
    /** Highest index whose restoration has been verified, plus one. */
    @Volatile private var matrixNextIndex = 0

    private val matrixJournalFile: java.io.File
        get() = java.io.File(reactContext.filesDir, MATRIX_JOURNAL)

    private fun matrixRead(namespace: String, key: String): String? {
        val r = reactContext.contentResolver
        return when (namespace) {
            "system" -> Settings.System.getString(r, key)
            "secure" -> Settings.Secure.getString(r, key)
            else -> Settings.Global.getString(r, key)
        }
    }

    private fun matrixWrite(namespace: String, key: String, value: String) {
        val r = reactContext.contentResolver
        when (namespace) {
            "system" -> Settings.System.putString(r, key, value)
            "secure" -> Settings.Secure.putString(r, key, value)
            else -> Settings.Global.putString(r, key, value)
        }
    }

    /** Synchronous, forced to disk before returning. Never logged. */
    private fun matrixWriteJournal(namespace: String, key: String, original: String, state: String) {
        val obj = org.json.JSONObject()
        obj.put("namespace", namespace)
        obj.put("key", key)
        obj.put("original", original)
        obj.put("state", state)
        val bytes = obj.toString().toByteArray(Charsets.UTF_8)
        java.io.FileOutputStream(matrixJournalFile).use { out ->
            out.write(bytes)
            out.flush()
            // force(true) flushes data AND metadata. The journal has to
            // survive process death and an activity recreation mid-write,
            // not merely reach the page cache.
            out.channel.force(true)
        }
    }

    private fun matrixClearJournal() {
        matrixJournalFile.delete()
    }

    /**
     * The alternate value, chosen internally and never exposed.
     *
     * Every rule stays inside the SAME domain the production validator
     * enforces, so nothing is proven under looser bounds than it will later
     * be written under. Each is minimal and instantly reversible.
     */
    private fun matrixAlternate(key: String, original: String): String? = when (key) {
        // The arms for the ten keys accepted in round 1 are GONE, not left as
        // unreachable branches. They were already unreachable -- matrixRoundTrip
        // refuses anything MATRIX_ORDER does not contain, and the JS bridge
        // refuses it too -- but their key strings still landed in the compiled
        // dex, and the artifact gate rightly flagged that: a build that still
        // knows how to mutate a key it must never run is a build whose contents
        // do not match its purpose. Removing them makes the artifact scan
        // able to distinguish this build from the twelve-key one by content,
        // not just by a version tag.
        //
        // Animation speed multiplier. Developer options offers
        // 0.5x/1x/1.5x/2x/5x/10x. Zero is never chosen: "off" disables
        // animation rather than changing its speed.
        "global.transition_animation_scale" -> {
            val f = original.trim().toFloatOrNull()
            if (f == null || f < 0f || f > 10f) null
            else if (f == 1.0f) "0.5" else "1.0"
        }
        // Font scale. The platform control offers 0.85 / 1.0 / 1.15 / 1.3.
        // ONE step, and the smallest visible one.
        "system.font_scale" -> {
            val f = original.trim().toFloatOrNull()
            if (f == null || f < 0.5f || f > 2.0f) null
            else if (f == 1.0f) "1.15" else "1.0"
        }
        else -> null
    }

    /** WRITE_SETTINGS is an appop, separate from WRITE_SECURE_SETTINGS. */
    @ReactMethod
    fun canWriteSystemSettings(promise: Promise) {
        promise.resolve(Settings.System.canWrite(reactContext))
    }

    private fun hasMatrixSecurePermission(): Boolean =
        reactContext.checkSelfPermission(
            android.Manifest.permission.WRITE_SECURE_SETTINGS
        ) == android.content.pm.PackageManager.PERMISSION_GRANTED

    /**
     * Read -> validate -> journal -> change -> fresh-read verify -> restore in
     * finally -> fresh-read verify -> clear journal.
     *
     * Returns one coarse status. No value, no key, no exception text.
     */
    @ReactMethod
    fun matrixRoundTrip(fullKey: String, promise: Promise) {
        if (!matrixInFlight.compareAndSet(false, true)) {
            promise.resolve("error")
            return
        }

        var outcome: String? = null
        var original: String? = null
        var mutationAttempted = false
        var journalWritten = false
        var namespace = ""
        var key = ""

        try {
            // Three independent reasons to refuse, and the third is why the
            // results file carries a `blocked` flag at all: the in-memory
            // latch dies with the process, and a restoration failure must
            // outlive a restart rather than being forgotten by one.
            if (matrixRestorationFailed || matrixJournalFile.exists() || matrixBlockedPersisted()) {
                outcome = "restore_failed_stop_immediately"
                return
            }
            val index = MATRIX_ORDER.indexOf(fullKey)
            if (index < 0) {
                outcome = "error"
                return
            }
            // ONE AT A TIME, IN ORDER. The next key stays refused until the
            // previous original has been restored and verified.
            if (index != matrixNextIndex) {
                outcome = "out_of_order"
                return
            }
            val cut = fullKey.indexOf('.')
            namespace = fullKey.substring(0, cut)
            key = fullKey.substring(cut + 1)

            val permitted =
                if (namespace == "system") Settings.System.canWrite(reactContext)
                else hasMatrixSecurePermission()
            if (!permitted) {
                outcome = "permission_missing"
                return
            }

            val current = matrixRead(namespace, key)
            // Absent: refuse before any write. This never creates a key.
            if (current == null) {
                outcome = "key_not_present"
                return
            }

            val alternate = matrixAlternate(fullKey, current)
            if (alternate == null || alternate == current) {
                outcome = "unsupported_value"
                return
            }

            matrixWriteJournal(namespace, key, current, "pending")
            journalWritten = true
            original = current

            mutationAttempted = true
            matrixWrite(namespace, key, alternate)

            // Fresh read from the provider, not the write's own return.
            outcome = if (matrixRead(namespace, key) == alternate) "round_trip_succeeded"
                      else "change_not_persisted_original_restored"
        } catch (e: SecurityException) {
            outcome = if (mutationAttempted) "change_write_failed_original_intact"
                      else "permission_missing"
        } catch (e: Exception) {
            outcome = "error"
        } finally {
            var restoreOk = true
            val toRestore = original
            if (toRestore != null) {
                restoreOk = false
                try {
                    matrixWrite(namespace, key, toRestore)
                    restoreOk = matrixRead(namespace, key) == toRestore
                } catch (e: Exception) {
                    restoreOk = false
                }
            }

            if (!restoreOk) {
                // Keep the journal: it is the only thing that can finish the
                // restoration on the next launch. Everything after this is
                // blocked, including cleanup.
                matrixRestorationFailed = true
                outcome = "restore_failed_stop_immediately"
            } else {
                if (journalWritten && toRestore != null) {
                    try { matrixWriteJournal(namespace, key, toRestore, "verified") } catch (e: Exception) { }
                    matrixClearJournal()
                }
                if (outcome == null) outcome = "error"
                if (mutationAttempted &&
                    outcome != "round_trip_succeeded" &&
                    outcome != "change_not_persisted_original_restored" &&
                    outcome != "change_write_failed_original_intact") {
                    outcome = "restore_succeeded_after_test_failure"
                }
                // Advance only on a definite, restored outcome for THIS index.
                if (outcome != "out_of_order" && outcome != "error") {
                    val index = MATRIX_ORDER.indexOf(fullKey)
                    if (index == matrixNextIndex) matrixNextIndex = index + 1
                }
            }

            // PERSIST HERE AND NOWHERE ELSE. This is the point at which the
            // native method has reached its final verified outcome: the
            // restoration has been attempted and checked, the journal has been
            // cleared or deliberately kept, and `outcome` will not change
            // again. Persisting any earlier would record a label the run had
            // not yet earned.
            //
            // 'out_of_order' and 'error' are not recorded: neither is a
            // statement about the key, only about the request.
            val finalOutcome = outcome ?: "error"
            if (finalOutcome != "out_of_order" && finalOutcome != "error") {
                matrixPersistResult(fullKey, finalOutcome)
            }

            promise.resolve(finalOutcome)
            matrixInFlight.set(false)
        }
    }

    /**
     * NON-MUTATING presence probe. Writes nothing, ever.
     *
     * `key_not_present` from the earlier run proved only that no ROW existed.
     * It did not distinguish "known setting sitting on its implicit default"
     * from "not supported on this OS or OEM". Writing would answer it by
     * creating the row, which is precisely the false positive to avoid, so
     * the discriminator is reflection over the platform's own Settings
     * constants: a key declared there is one the platform knows.
     */
    @ReactMethod
    fun matrixProbePresence(fullKey: String, promise: Promise) {
        try {
            if (!MATRIX_PROBES.contains(fullKey)) {
                promise.resolve("error")
                return
            }
            val cut = fullKey.indexOf('.')
            val namespace = fullKey.substring(0, cut)
            val key = fullKey.substring(cut + 1)

            if (matrixRead(namespace, key) != null) {
                matrixPersistResult(fullKey, "present_row")
                promise.resolve("present_row")
                return
            }

            val cls = when (namespace) {
                "secure" -> Settings.Secure::class.java
                "global" -> Settings.Global::class.java
                else -> Settings.System::class.java
            }
            // Match on the FIELD NAME. Android filters @hide members out of
            // getDeclaredFields() and blocks get() on them for a non-exempt
            // app, so comparing field VALUES degrades silently to "not
            // declared". The Settings classes name their constants as the
            // uppercased key, which is readable without any hidden-API
            // access.
            //
            // LIMIT, and it is a real one: a key that exists but is @hide
            // reads the same as a key that does not exist at all. This
            // narrows the question, it does not close it.
            val wanted = key.uppercase()
            var declared = false
            for (f in cls.declaredFields) {
                if (f.name == wanted) { declared = true; break }
            }
            val probeOutcome =
                if (declared) "absent_key_in_public_sdk"
                else "absent_key_not_in_public_sdk"
            matrixPersistResult(fullKey, probeOutcome)
            promise.resolve(probeOutcome)
        } catch (e: Exception) {
            promise.resolve("error")
        }
    }

    /** Startup recovery. Must run before any test control renders. */
    @ReactMethod
    fun matrixRecoverPendingRollback(promise: Promise) {
        try {
            if (!matrixJournalFile.exists()) {
                promise.resolve("no_pending_rollback")
                return
            }
            val obj = try {
                org.json.JSONObject(matrixJournalFile.readText(Charsets.UTF_8))
            } catch (e: Exception) { null }
            if (obj == null) {
                matrixRestorationFailed = true
                promise.resolve("pending_rollback_restore_failed")
                return
            }
            val state = obj.optString("state")
            val namespace = obj.optString("namespace")
            val key = obj.optString("key")
            val original = if (obj.has("original")) obj.optString("original") else null

            if (state == "verified") {
                matrixClearJournal()
                promise.resolve("no_pending_rollback")
                return
            }
            if (state != "pending" || original == null ||
                !MATRIX_ORDER.contains("$namespace.$key")) {
                matrixRestorationFailed = true
                promise.resolve("pending_rollback_restore_failed")
                return
            }

            val permitted =
                if (namespace == "system") Settings.System.canWrite(reactContext)
                else hasMatrixSecurePermission()
            if (!permitted) {
                matrixRestorationFailed = true
                promise.resolve("permission_missing")
                return
            }

            if (matrixRead(namespace, key) != original) {
                matrixWrite(namespace, key, original)
            }
            if (matrixRead(namespace, key) == original) {
                matrixWriteJournal(namespace, key, original, "verified")
                matrixClearJournal()
                promise.resolve("pending_rollback_restored")
            } else {
                matrixRestorationFailed = true
                promise.resolve("pending_rollback_restore_failed")
            }
        } catch (e: Exception) {
            matrixRestorationFailed = true
            promise.resolve("error")
        }
    }

    /** Presence only -- never the namespace, key, or value. */
    @ReactMethod
    fun matrixRollbackPending(promise: Promise) {
        promise.resolve(
            matrixJournalFile.exists() || matrixRestorationFailed || matrixBlockedPersisted()
        )
    }

    /** Index of the next key permitted to run. Ordering state, not a value. */
    @ReactMethod
    fun matrixNextAllowedIndex(promise: Promise) {
        promise.resolve(matrixNextIndex)
    }

    // ---- durable coarse-result store ------------------------------------
    //
    // WHY THIS EXISTS
    //
    // system.font_scale writes a configuration change, so Android destroys and
    // recreates the activity underneath the running round trip. The native
    // call is unaffected -- it finishes on the bridge thread, restores the
    // original and clears the journal. What did NOT survive was the RESULT:
    // it lived only in React state, so the remount wiped it.
    //
    // The consequence was absurd in hindsight. The one key whose recreation
    // was anticipated, and whose journal was specifically built to survive it,
    // was the one key whose outcome could not be read back afterwards. The
    // journal got durability; the evidence did not.
    //
    // ONLY the coarse result CODE is stored. No setting value, no original,
    // no alternate -- the write below refuses anything that is not one of the
    // known codes, so a value cannot reach this file even by mistake.
    private val MATRIX_RESULTS = "afterswitch-matrix-results.json"

    private val matrixResultsFile: java.io.File
        get() = java.io.File(reactContext.filesDir, MATRIX_RESULTS)

    /** The only strings that may ever be persisted. */
    private val MATRIX_RESULT_CODES = setOf(
        "round_trip_succeeded",
        "key_not_present",
        "change_write_failed_original_intact",
        "change_not_persisted_original_restored",
        "restore_succeeded_after_test_failure",
        "restore_failed_stop_immediately",
        "permission_missing",
        "unsupported_value",
        "present_row",
        "absent_key_in_public_sdk",
        "absent_key_not_in_public_sdk"
    )

    private fun matrixReadResults(): org.json.JSONObject =
        if (!matrixResultsFile.exists()) org.json.JSONObject()
        else try {
            org.json.JSONObject(matrixResultsFile.readText(Charsets.UTF_8))
        } catch (e: Exception) {
            org.json.JSONObject()
        }

    /** True once a restoration failure has been recorded, across restarts. */
    private fun matrixBlockedPersisted(): Boolean =
        matrixReadResults().optBoolean("blocked", false)

    /**
     * Record one coarse outcome. Called ONLY from the finally path, after the
     * native method has reached its final verified outcome -- never
     * speculatively, and never before the restoration has been checked.
     *
     * A latched restoration failure is permanent: once `blocked` is set,
     * nothing further is written, so a later result cannot paper over it.
     */
    private fun matrixPersistResult(fullKey: String, outcome: String) {
        if (!MATRIX_RESULT_CODES.contains(outcome)) return
        try {
            val obj = matrixReadResults()
            if (obj.optBoolean("blocked", false)) return
            obj.put(fullKey, outcome)
            if (outcome == "restore_failed_stop_immediately") obj.put("blocked", true)
            val bytes = obj.toString().toByteArray(Charsets.UTF_8)
            java.io.FileOutputStream(matrixResultsFile).use { out ->
                out.write(bytes)
                out.flush()
                out.channel.force(true)
            }
        } catch (e: Exception) {
            // A result we could not persist is a lost label, not a hazard.
            // The journal, not this file, is what protects the setting.
        }
    }

    /** Coarse codes only. Read on mount alongside the ordering index. */
    @ReactMethod
    fun matrixPersistedResults(promise: Promise) {
        try {
            val obj = matrixReadResults()
            val map = Arguments.createMap()
            val it = obj.keys()
            while (it.hasNext()) {
                val k = it.next()
                if (k == "blocked") {
                    map.putBoolean("blocked", obj.optBoolean("blocked", false))
                } else {
                    val v = obj.optString(k)
                    // Defence in depth: refuse to hand back anything that is
                    // not a known code, even if the file were tampered with.
                    if (MATRIX_RESULT_CODES.contains(v)) map.putString(k, v)
                }
            }
            promise.resolve(map)
        } catch (e: Exception) {
            promise.resolve(Arguments.createMap())
        }
    }

    /**
     * The ONLY path that clears results. Explicit new-test/reset action.
     *
     * Refuses while a rollback is pending or a restoration failure is
     * latched: clearing then would erase the record that something still
     * needs finishing, which is exactly when the record matters most.
     */
    @ReactMethod
    fun matrixResetResults(promise: Promise) {
        try {
            if (matrixJournalFile.exists() || matrixRestorationFailed || matrixBlockedPersisted()) {
                promise.resolve("refused_pending")
                return
            }
            matrixResultsFile.delete()
            matrixNextIndex = 0
            promise.resolve("reset")
        } catch (e: Exception) {
            promise.resolve("error")
        }
    }

    /** Which matrix build this is. Identity only -- never a setting value. */
    @ReactMethod
    fun matrixBuildTag(promise: Promise) {
        promise.resolve(MATRIX_BUILD_TAG)
    }
    // ======= END TEMPORARY EXPERIMENT ====================================

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
