import {
  deleteField,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';

import type { ID, Locale, ThemePreference, UserProfile } from '@/lib/domain/types';
import { getFirebaseClient } from '@/lib/firebase/client';
import { userFromSnapshot } from '@/lib/firebase/converters';

/**
 * users/{uid} access (DESIGN §7). Writes are not awaited by the UI: Firestore applies them
 * locally at once and syncs later, even offline. Every update repeats `isGuest`, which the
 * rules require to match the current token.
 */

function userRef(uid: string) {
  return doc(getFirebaseClient().db, 'users', uid);
}

function definedOnly<T extends Record<string, unknown>>(fields: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

export function subscribeProfile(
  uid: string,
  onChange: (profile: UserProfile | null, meta: { fromCache: boolean }) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  // Metadata changes are included so the switch from cached to server data is seen even
  // when the data itself is unchanged: a missing profile is only created once the server
  // confirms it is missing.
  return onSnapshot(
    userRef(uid),
    { includeMetadataChanges: true },
    (snapshot) => onChange(userFromSnapshot(snapshot), { fromCache: snapshot.metadata.fromCache }),
    onError,
  );
}

export interface NewProfile {
  isGuest: boolean;
  locale: Locale;
  theme?: ThemePreference;
  email?: string;
  displayName?: string;
  photoURL?: string;
}

export function createProfile(uid: string, profile: NewProfile): Promise<void> {
  return setDoc(userRef(uid), {
    ...definedOnly({
      email: profile.email,
      displayName: profile.displayName,
      photoURL: profile.photoURL,
    }),
    isGuest: profile.isGuest,
    locale: profile.locale,
    theme: profile.theme ?? 'system',
    selfPersonIds: {},
    onboardingCompleted: false,
    createdAt: serverTimestamp(),
    lastActiveAt: serverTimestamp(),
    schemaVersion: 1,
  });
}

/** Copies account facts (guest or not, email, name, photo) from Auth into the profile. */
export function syncAccount(
  uid: string,
  account: { isGuest: boolean; email?: string; displayName?: string; photoURL?: string },
): Promise<void> {
  return updateDoc(userRef(uid), {
    ...definedOnly({
      email: account.email,
      displayName: account.displayName,
      photoURL: account.photoURL,
    }),
    isGuest: account.isGuest,
  });
}

export function touchLastActive(uid: string, isGuest: boolean): Promise<void> {
  return updateDoc(userRef(uid), { isGuest, lastActiveAt: serverTimestamp() });
}

export function updateSettings(
  uid: string,
  isGuest: boolean,
  settings: { displayName?: string; locale?: Locale; theme?: ThemePreference },
): Promise<void> {
  return updateDoc(userRef(uid), { ...definedOnly(settings), isGuest });
}

/** Marks who the user is in a tree, or clears it with null (PER-10): one person per tree. */
export function setSelfPerson(
  uid: string,
  isGuest: boolean,
  treeId: ID,
  personId: ID | null,
): Promise<void> {
  return updateDoc(userRef(uid), {
    [`selfPersonIds.${treeId}`]: personId ?? deleteField(),
    isGuest,
  });
}

/** The first-run wizard is done or skipped (ONB-02); it isn't offered again. */
export function completeOnboarding(uid: string, isGuest: boolean): Promise<void> {
  return updateDoc(userRef(uid), { onboardingCompleted: true, isGuest });
}
