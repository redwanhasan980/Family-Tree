import 'server-only';

import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

import { EMULATOR_PROJECT_ID } from './config';

const ServiceAccountKeys = ['project_id', 'client_email', 'private_key'] as const;

function createAdminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;

  // With the Emulator Suite the Admin SDK needs no credentials.
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    return initializeApp({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || EMULATOR_PROJECT_ID,
    });
  }

  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!encoded) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT (base64 service-account JSON) is not set.');
  }
  const account = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as Record<
    (typeof ServiceAccountKeys)[number],
    string
  >;
  for (const key of ServiceAccountKeys) {
    if (!account[key]) throw new Error(`FIREBASE_SERVICE_ACCOUNT is missing "${key}".`);
  }
  return initializeApp({
    credential: cert({
      projectId: account.project_id,
      clientEmail: account.client_email,
      privateKey: account.private_key,
    }),
    projectId: account.project_id,
  });
}

/** Admin Auth, created on first use so builds never need credentials. */
export function getAdminAuth(): Auth {
  return getAuth(createAdminApp());
}

/** Admin Firestore, created on first use so builds never need credentials. */
export function getAdminDb(): Firestore {
  return getFirestore(createAdminApp());
}
