/**
 * Firebase initialization for AfterSwitch.
 * Uses the wellbuilt-sync Firebase project.
 * Cloud profiles stored in Firestore `afterswitch_profiles/` collection.
 */

import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyAGWXa-doFGzo7T5SxHVD_v5-SHXIc8wAI',
  authDomain: 'wellbuilt-sync.firebaseapp.com',
  databaseURL: 'https://wellbuilt-sync-default-rtdb.firebaseio.com',
  projectId: 'wellbuilt-sync',
  storageBucket: 'wellbuilt-sync.firebasestorage.app',
  messagingSenderId: '559487114498',
  appId: '1:559487114498:web:e951ab0c6388339d5bf61b',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

/**
 * Ensure the user is signed in (anonymously for now).
 * Returns the current user, signing in if needed.
 */
export async function ensureAuth(): Promise<User> {
  if (auth.currentUser) return auth.currentUser;

  // Wait for auth state to initialize
  const user = await new Promise<User | null>((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      unsubscribe();
      resolve(u);
    });
  });

  if (user) return user;

  // Sign in anonymously
  const result = await signInAnonymously(auth);
  return result.user;
}
