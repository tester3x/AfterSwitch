/**
 * Firebase initialization for AfterSwitch.
 * Uses the wellbuilt-sync Firebase project.
 * Cloud profiles stored in Firestore `afterswitch_profiles/` collection.
 *
 * Auth: Google Sign-In via @react-native-google-signin → Firebase credential.
 */

import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithCredential,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  type User,
} from 'firebase/auth';
export type { User } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';

const firebaseConfig = {
  apiKey: 'AIzaSyAGWXa-doFGzo7T5SxHVD_v5-SHXIc8wAI',
  authDomain: 'wellbuilt-sync.firebaseapp.com',
  databaseURL: 'https://wellbuilt-sync-default-rtdb.firebaseio.com',
  projectId: 'wellbuilt-sync',
  storageBucket: 'wellbuilt-sync.firebasestorage.app',
  messagingSenderId: '559487114498',
  appId: '1:559487114498:web:e951ab0c6388339d5bf61b',
};

/**
 * ⚠️ SETUP REQUIRED:
 * 1. Firebase Console → Authentication → Sign-in method → Enable Google
 * 2. Copy the "Web client ID" shown after enabling Google
 * 3. Paste it here
 * 4. Firebase Console → Project Settings → Android app (com.afterswitch.app) → Add SHA-1
 *    (Run `eas credentials` to get the SHA-1 fingerprint)
 */
const WEB_CLIENT_ID = 'PASTE_WEB_CLIENT_ID_HERE.apps.googleusercontent.com';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Configure Google Sign-In on module load
GoogleSignin.configure({
  webClientId: WEB_CLIENT_ID,
});

/**
 * Sign in with Google → Firebase credential.
 * Uses native Google Play Services account picker.
 */
export async function signInWithGoogle(): Promise<User> {
  await GoogleSignin.hasPlayServices();
  const response = await GoogleSignin.signIn();

  if (response.type !== 'success' || !response.data?.idToken) {
    throw new Error('Google Sign-In failed or was cancelled.');
  }

  const credential = GoogleAuthProvider.credential(response.data.idToken);
  const result = await signInWithCredential(auth, credential);
  return result.user;
}

/**
 * Sign out of both Firebase and Google.
 */
export async function signOutUser(): Promise<void> {
  await GoogleSignin.signOut();
  await signOut(auth);
}

/**
 * Listen for auth state changes.
 * Returns unsubscribe function.
 */
export function onAuthChanged(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

/**
 * Get the current authenticated user.
 * Returns null if not signed in.
 */
export function getCurrentUser(): User | null {
  return auth.currentUser;
}

/**
 * Ensure the user is signed in.
 * For cloud operations — returns current user or throws.
 */
export function ensureAuth(): User {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in. Please sign in with Google first.');
  return user;
}
