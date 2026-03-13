/**
 * Shared profile system for AfterSwitch.
 * Top-level `shared_profiles` collection — readable by any authenticated user.
 * Users can share their profiles publicly, browse others, look up by code/link.
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
  where,
  limit,
  startAfter,
  serverTimestamp,
  increment,
  updateDoc,
  type Timestamp,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db, ensureAuth } from './firebase';
import type { DeviceProfile } from '../types/profile';

/** Metadata for browsing shared profiles. */
export type SharedProfileMeta = {
  id: string;
  deviceName: string;
  model: string;
  manufacturer: string;
  sharedAt: string;
  settingsCount: number;
  appsCount: number;
  ownerName: string;
  shareCode: string;
  downloads: number;
};

const SHARED_COLLECTION = 'shared_profiles';

/** Generate a random 6-char uppercase alphanumeric code. */
function generateShareCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I/1/O/0 to avoid confusion
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/** Check if a share code is already taken. */
async function isCodeTaken(code: string): Promise<boolean> {
  const q = query(
    collection(db, SHARED_COLLECTION),
    where('shareCode', '==', code),
    limit(1),
  );
  const snap = await getDocs(q);
  return !snap.empty;
}

/** Generate a unique share code (retry if collision). */
async function generateUniqueShareCode(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = generateShareCode();
    if (!(await isCodeTaken(code))) return code;
  }
  // Extremely unlikely fallback — 5 collisions in a row
  return generateShareCode() + Math.floor(Math.random() * 10);
}

/**
 * Share a profile to the public community gallery.
 * Copies the full profile to `shared_profiles/{id}`.
 * Returns the share code.
 */
export async function shareProfile(
  profile: DeviceProfile,
  ownerName: string,
): Promise<{ sharedId: string; shareCode: string }> {
  const user = ensureAuth();
  const shareCode = await generateUniqueShareCode();

  const safeModel = profile.device.model.replace(/[^a-zA-Z0-9-_]/g, '-');
  const sharedId = `${safeModel}-${Date.now()}`;

  const docRef = doc(db, SHARED_COLLECTION, sharedId);

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
    sharedAt: serverTimestamp(),
    ownerUid: user.uid,
    ownerName,
    shareCode,
    downloads: 0,
    schemaVersion: profile.schemaVersion,
  });

  return { sharedId, shareCode };
}

/**
 * Unshare a profile — remove from the community gallery.
 * Only the owner can do this (enforced by checking ownerUid).
 */
export async function unshareProfile(sharedId: string): Promise<void> {
  const user = ensureAuth();
  const docRef = doc(db, SHARED_COLLECTION, sharedId);
  const snap = await getDoc(docRef);

  if (!snap.exists()) return;
  if (snap.data().ownerUid !== user.uid) {
    throw new Error('You can only unshare your own profiles.');
  }

  await deleteDoc(docRef);
}

/**
 * Check if the current user has shared any profiles.
 * Returns metadata for their shared profiles.
 */
export async function getMySharedProfiles(): Promise<SharedProfileMeta[]> {
  const user = ensureAuth();

  const q = query(
    collection(db, SHARED_COLLECTION),
    where('ownerUid', '==', user.uid),
    orderBy('sharedAt', 'desc'),
  );
  const snap = await getDocs(q);

  return snap.docs.map(docToMeta);
}

/**
 * Browse shared profiles with optional manufacturer filter.
 * Supports cursor-based pagination.
 */
export async function browseSharedProfiles(options?: {
  manufacturer?: string;
  pageSize?: number;
  afterDoc?: QueryDocumentSnapshot;
}): Promise<{ profiles: SharedProfileMeta[]; lastDoc: QueryDocumentSnapshot | null }> {
  const pageSize = options?.pageSize ?? 20;

  const constraints: any[] = [];

  if (options?.manufacturer) {
    constraints.push(where('manufacturer', '==', options.manufacturer));
  }

  constraints.push(orderBy('downloads', 'desc'));
  constraints.push(limit(pageSize));

  if (options?.afterDoc) {
    constraints.push(startAfter(options.afterDoc));
  }

  const q = query(collection(db, SHARED_COLLECTION), ...constraints);
  const snap = await getDocs(q);

  const profiles = snap.docs.map(docToMeta);
  const lastDoc = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;

  return { profiles, lastDoc };
}

/**
 * Look up a shared profile by its 6-char share code.
 */
export async function getProfileByShareCode(code: string): Promise<DeviceProfile | null> {
  const normalized = code.toUpperCase().trim();
  const q = query(
    collection(db, SHARED_COLLECTION),
    where('shareCode', '==', normalized),
    limit(1),
  );
  const snap = await getDocs(q);

  if (snap.empty) return null;

  const data = snap.docs[0].data();

  // Increment download count (fire-and-forget)
  updateDoc(snap.docs[0].ref, { downloads: increment(1) }).catch(() => {});

  return JSON.parse(data.profile) as DeviceProfile;
}

/**
 * Load a shared profile by document ID (for deep links).
 */
export async function getSharedProfileById(sharedId: string): Promise<DeviceProfile | null> {
  const docRef = doc(db, SHARED_COLLECTION, sharedId);
  const snap = await getDoc(docRef);

  if (!snap.exists()) return null;

  const data = snap.data();

  // Increment download count
  updateDoc(docRef, { downloads: increment(1) }).catch(() => {});

  return JSON.parse(data.profile) as DeviceProfile;
}

/** Convert a Firestore doc snapshot to SharedProfileMeta. */
function docToMeta(d: QueryDocumentSnapshot): SharedProfileMeta {
  const data = d.data();
  const sharedAt = data.sharedAt as Timestamp | null;
  return {
    id: d.id,
    deviceName: data.deviceName || 'Unknown',
    model: data.model || 'Unknown',
    manufacturer: data.manufacturer || 'Unknown',
    sharedAt: sharedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
    settingsCount: data.settingsCount || 0,
    appsCount: data.appsCount || 0,
    ownerName: data.ownerName || 'Anonymous',
    shareCode: data.shareCode || '',
    downloads: data.downloads || 0,
  };
}
