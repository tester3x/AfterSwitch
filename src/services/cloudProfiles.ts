/**
 * Cloud profile storage via Firestore.
 * Save, load, list, and delete profiles in the cloud.
 * Users can access their profiles from any device after signing in.
 */

import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
  type Timestamp,
} from 'firebase/firestore';
import { db, ensureAuth } from './firebase';
import type { DeviceProfile } from '../types/profile';

/** Metadata shown in the profile list (without the full settings blob). */
export type CloudProfileMeta = {
  id: string;
  deviceName: string;
  model: string;
  manufacturer: string;
  savedAt: string;
  settingsCount: number;
  appsCount: number;
};

const COLLECTION = 'afterswitch_profiles';

/**
 * Save a profile to the cloud under the current user's account.
 * Profile ID is based on device model + timestamp for uniqueness.
 */
export async function saveProfileToCloud(profile: DeviceProfile): Promise<string> {
  const user = ensureAuth();

  const safeModel = profile.device.model.replace(/[^a-zA-Z0-9-_]/g, '-');
  const profileId = `${safeModel}-${Date.now()}`;

  const docRef = doc(db, COLLECTION, user.uid, 'profiles', profileId);

  await setDoc(docRef, {
    profile: JSON.stringify(profile),
    deviceName: profile.device.nickname,
    model: profile.device.model,
    manufacturer: profile.device.manufacturer,
    settingsCount:
      Object.keys(profile.settings.system).length +
      Object.keys(profile.settings.secure).length +
      Object.keys(profile.settings.global).length +
      Object.keys(profile.settings.samsung).length,
    appsCount: profile.apps.installed.length,
    savedAt: serverTimestamp(),
    schemaVersion: profile.schemaVersion,
  });

  return profileId;
}

/**
 * List all saved profiles for the current user.
 * Returns metadata only (not the full profile data).
 */
export async function listCloudProfiles(): Promise<CloudProfileMeta[]> {
  const user = ensureAuth();

  const profilesRef = collection(db, COLLECTION, user.uid, 'profiles');
  const q = query(profilesRef, orderBy('savedAt', 'desc'));
  const snapshot = await getDocs(q);

  return snapshot.docs.map((d) => {
    const data = d.data();
    const savedAt = data.savedAt as Timestamp | null;
    return {
      id: d.id,
      deviceName: data.deviceName || 'Unknown',
      model: data.model || 'Unknown',
      manufacturer: data.manufacturer || 'Unknown',
      savedAt: savedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
      settingsCount: data.settingsCount || 0,
      appsCount: data.appsCount || 0,
    };
  });
}

/**
 * Load a specific profile from the cloud by ID.
 */
export async function loadCloudProfile(profileId: string): Promise<DeviceProfile | null> {
  const user = ensureAuth();

  const docRef = doc(db, COLLECTION, user.uid, 'profiles', profileId);
  const snapshot = await getDoc(docRef);

  if (!snapshot.exists()) return null;

  const data = snapshot.data();
  return JSON.parse(data.profile) as DeviceProfile;
}

/**
 * Delete a profile from the cloud.
 */
export async function deleteCloudProfile(profileId: string): Promise<void> {
  const user = ensureAuth();

  const docRef = doc(db, COLLECTION, user.uid, 'profiles', profileId);
  await deleteDoc(docRef);
}
