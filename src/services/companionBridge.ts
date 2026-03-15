/**
 * Companion Bridge — communicates with the AfterSwitch Desktop Companion
 * via HTTP over ADB reverse port forwarding.
 *
 * When the companion is connected via USB and running, the phone can reach
 * it at localhost:38291. The companion executes `adb shell settings put`
 * commands which run at shell privilege level — bypassing Android's
 * ContentProvider whitelist that blocks app-level Settings.putString().
 */

const BRIDGE_PORT = 38291;
const BRIDGE_URL = `http://localhost:${BRIDGE_PORT}`;
const PING_TIMEOUT = 2000;
const WRITE_TIMEOUT = 30000;

export type CompanionStatus = {
  available: boolean;
  serial?: string;
  version?: string;
};

export type SettingToWrite = {
  namespace: string; // 'system' | 'secure' | 'global'
  key: string;
  value: string;
};

/**
 * Rich write result from the companion.
 * - success: value written and verified via read-back
 * - not_applicable: key doesn't exist on this device (cross-device restore)
 * - overridden: key exists but system enforces a different value
 * - error: write threw an exception
 */
export type WriteResultStatus = 'success' | 'not_applicable' | 'overridden' | 'error';

export type WriteResult = {
  namespace: string;
  key: string;
  success: boolean;
  status: WriteResultStatus;
  error?: string;
};

export type BulkWriteResult = {
  results: WriteResult[];
  successCount: number;
  failedCount: number;
  notApplicableCount: number;
};

/**
 * Check if the companion bridge is available (phone connected via USB,
 * companion running with bridge active).
 */
export async function isCompanionAvailable(): Promise<CompanionStatus> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PING_TIMEOUT);

    const response = await fetch(`${BRIDGE_URL}/ping`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return { available: false };
    }

    const data = await response.json();
    return {
      available: data.status === 'ready',
      serial: data.serial,
      version: data.version,
    };
  } catch {
    return { available: false };
  }
}

/**
 * Write multiple settings via the companion bridge (bulk operation).
 * Each setting is written via `adb shell settings put` at shell privilege.
 */
export async function writeSettingsViaCompanion(
  settings: SettingToWrite[]
): Promise<BulkWriteResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WRITE_TIMEOUT);

    const response = await fetch(`${BRIDGE_URL}/apply-settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Bridge error: ${error}`);
    }

    return await response.json();
  } catch (err: any) {
    // If bridge died or timed out, return all failed
    return {
      results: settings.map((s) => ({
        namespace: s.namespace,
        key: s.key,
        success: false,
        status: 'error' as WriteResultStatus,
        error: err.message || 'Bridge connection failed',
      })),
      successCount: 0,
      failedCount: settings.length,
      notApplicableCount: 0,
    };
  }
}

/**
 * Write a single setting via the companion bridge.
 */
export async function writeSettingViaCompanion(
  namespace: string,
  key: string,
  value: string
): Promise<{ success: boolean; status: WriteResultStatus }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(`${BRIDGE_URL}/write-setting`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ namespace, key, value }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) return { success: false, status: 'error' };

    const data = await response.json();
    return { success: data.success === true, status: data.status || 'error' };
  } catch {
    return { success: false, status: 'error' };
  }
}
