import { Timestamp, type DocumentSnapshot } from 'firebase/firestore';

import { personFromDoc, relationshipFromDoc, treeFromDoc } from '@/lib/domain/documents';
import type {
  Locale,
  Person,
  Relationship,
  ThemePreference,
  Tree,
  UserProfile,
} from '@/lib/domain/types';

function toDate(value: unknown, fallback: Date): Date {
  return value instanceof Timestamp ? value.toDate() : fallback;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Reads users/{uid}. Pending server timestamps are estimated, and malformed fields fall
 * back to safe defaults so a bad document never crashes the app.
 */
export function userFromSnapshot(snapshot: DocumentSnapshot): UserProfile | null {
  if (!snapshot.exists()) return null;
  const data = snapshot.data({ serverTimestamps: 'estimate' });
  const now = new Date();
  const locale: Locale = data.locale === 'en' ? 'en' : 'bn';
  const theme: ThemePreference =
    data.theme === 'light' || data.theme === 'dark' ? data.theme : 'system';

  return {
    uid: snapshot.id,
    isGuest: data.isGuest !== false,
    displayName: optionalString(data.displayName),
    email: optionalString(data.email),
    photoURL: optionalString(data.photoURL),
    locale,
    theme,
    selfPersonIds:
      typeof data.selfPersonIds === 'object' && data.selfPersonIds !== null
        ? (data.selfPersonIds as Record<string, string>)
        : {},
    onboardingCompleted: data.onboardingCompleted === true,
    createdAt: toDate(data.createdAt, now),
    lastActiveAt: toDate(data.lastActiveAt, now),
    schemaVersion: 1,
  };
}

/**
 * A document's data with top-level timestamps as `Date`s. Pending server timestamps
 * (writes not yet confirmed) are estimated, so new documents sort sensibly at once.
 */
function plainData(snapshot: DocumentSnapshot): Record<string, unknown> | null {
  if (!snapshot.exists()) return null;
  const data = snapshot.data({ serverTimestamps: 'estimate' });
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key,
      value instanceof Timestamp ? value.toDate() : value,
    ]),
  );
}

export function personFromSnapshot(snapshot: DocumentSnapshot): Person | null {
  return personFromDoc(snapshot.id, plainData(snapshot), new Date());
}

export function relationshipFromSnapshot(snapshot: DocumentSnapshot): Relationship | null {
  return relationshipFromDoc(snapshot.id, plainData(snapshot), new Date());
}

export function treeFromSnapshot(snapshot: DocumentSnapshot): Tree | null {
  return treeFromDoc(snapshot.id, plainData(snapshot), new Date());
}
