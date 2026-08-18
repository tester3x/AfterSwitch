/**
 * PRIVACY HOLD — centralized, fail-closed safety gate.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 * A `DeviceProfile` is a verbatim dump of Settings.System, Settings.Secure,
 * Settings.Global and the Samsung OEM keys, plus the full installed-app list
 * and device identity. Nothing in the capture path filters or redacts it.
 *
 * Two outbound paths sent that raw object off the device:
 *
 *   1. `shareProfile()` wrote `JSON.stringify(profile)` into
 *      `shared_profiles/{id}` — a collection ANY authenticated user can read.
 *      That publishes android_id, Bluetooth identifiers, the device nickname
 *      (routinely a person's real name), the complete app inventory, enabled
 *      accessibility services and default apps to strangers.
 *
 *   2. `saveProfileToCloud()` ran fire-and-forget after EVERY scan, writing
 *      the same unredacted object to the user's private cloud collection
 *      without the user asking or being told.
 *
 * Both are held closed here until the redesign lands.
 *
 * ── WHAT RE-ENABLEMENT REQUIRES ──────────────────────────────────────────
 * Do not flip these to `true` to unblock a demo. Each flag may only be
 * re-enabled after ALL of the following exist:
 *
 *   • Separate private-backup and shareable-presentation schemas, so a
 *     shared profile is a different object, not a filtered copy of a
 *     private one.
 *   • An explicit OUTBOUND ALLOWLIST of keys permitted to leave the device.
 *     An allowlist, never a denylist — OEMs add Settings keys nobody has
 *     enumerated, so a denylist leaks by construction.
 *   • Hostile-input validation on anything received from the network.
 *   • A privacy review of exactly what the new schema emits.
 *   • Tests that fail if an unlisted key can reach the wire.
 *
 * ── DELIBERATELY NOT CONFIGURABLE ────────────────────────────────────────
 * These are compile-time constants. They are intentionally NOT remotely
 * toggleable, NOT environment-driven, and NOT stored in Firestore or
 * AsyncStorage — a privacy hold that a server (or a restored profile) can
 * switch off is not a hold. Changing one requires editing this file and
 * shipping a build.
 */

/** Uploading a profile to the public `shared_profiles` collection. */
export const COMMUNITY_SHARING_ENABLED = false;

/** Reading community profiles: browse, share code, QR, deep link. */
export const COMMUNITY_RETRIEVAL_ENABLED = false;

/** Uploading a raw, unredacted DeviceProfile to the private cloud. */
export const RAW_CLOUD_UPLOAD_ENABLED = false;

/** Coarse, non-technical text shown wherever a held path is reached. */
export const PRIVACY_HOLD_MESSAGE =
  'Community sharing is temporarily unavailable while privacy protections are upgraded.';

/** Thrown by a held service. Callers may catch it to render the message. */
export class PrivacyHoldError extends Error {
  readonly code = 'PRIVACY_HOLD';
  constructor(message: string = PRIVACY_HOLD_MESSAGE) {
    super(message);
    this.name = 'PrivacyHoldError';
  }
}

/**
 * Refuse before ANY serialization or Firestore call.
 *
 * Every held function calls one of these as its FIRST statement, before
 * touching the profile object and before importing/creating a doc ref, so a
 * refusal cannot leak data through a partially-built request.
 */
export function assertCommunitySharingAllowed(): void {
  if (!COMMUNITY_SHARING_ENABLED) throw new PrivacyHoldError();
}

export function assertCommunityRetrievalAllowed(): void {
  if (!COMMUNITY_RETRIEVAL_ENABLED) throw new PrivacyHoldError();
}

export function assertRawCloudUploadAllowed(): void {
  if (!RAW_CLOUD_UPLOAD_ENABLED) {
    throw new PrivacyHoldError(
      'Cloud backup is temporarily disabled while privacy protections are upgraded. Your profile is saved on this device.',
    );
  }
}
