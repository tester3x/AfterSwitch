/**
 * Firebase initialization for AfterSwitch.
 * Uses the afterswitch-app Firebase project (separate from wellbuilt-sync).
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
  apiKey: 'AIzaSyAqAjOIvtU1HRhepfubjEJb_ohkBAmUBzM',
  authDomain: 'afterswitch-app.firebaseapp.com',
  projectId: 'afterswitch-app',
  storageBucket: 'afterswitch-app.firebasestorage.app',
  messagingSenderId: '1022312211034',
  appId: '1:1022312211034:android:e301b5aaab762336a86e63',
};

const WEB_CLIENT_ID = '1022312211034-25hdb5bgmujagtmukl07e1j2cpkhhjr5.apps.googleusercontent.com';

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
