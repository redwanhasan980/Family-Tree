import 'client-only';

import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  connectAuthEmulator,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
  type Auth,
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';

import { parseFirebaseConfig } from './config';

export interface FirebaseClient {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
}

let client: FirebaseClient | undefined;

/**
 * Lazily creates the browser SDK instances (DESIGN §9.1): auth persisted in IndexedDB so
 * guest sessions survive reloads, and Firestore with a persistent multi-tab offline cache.
 * Only repositories and auth code may call this (CLAUDE.md rule 3).
 */
export function getFirebaseClient(): FirebaseClient {
  if (client) return client;
  if (typeof window === 'undefined') {
    throw new Error('The Firebase client SDK is only available in the browser.');
  }

  // NEXT_PUBLIC_* values must be read statically so Next.js can inline them.
  const { config, useEmulators } = parseFirebaseConfig({
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    NEXT_PUBLIC_USE_EMULATORS: process.env.NEXT_PUBLIC_USE_EMULATORS,
  });

  // After a hot reload the app already exists, and initialize* would throw.
  const existing = getApps()[0];
  if (existing) {
    client = { app: existing, auth: getAuth(existing), db: getFirestore(existing) };
    return client;
  }

  const app = initializeApp(config);
  // App Check (NFR-SEC-05) must start before Auth and Firestore make their first requests.
  const recaptchaKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
  if (!useEmulators && recaptchaKey) {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(recaptchaKey),
      isTokenAutoRefreshEnabled: true,
    });
  }
  const auth = initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    popupRedirectResolver: browserPopupRedirectResolver,
  });
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });

  if (useEmulators) {
    // 127.0.0.1 rather than "localhost", which may resolve to IPv6 where the emulators don't listen.
    const host = process.env.NEXT_PUBLIC_EMULATOR_HOST || '127.0.0.1';
    connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, host, 8080);
  }

  client = { app, auth, db };
  return client;
}
