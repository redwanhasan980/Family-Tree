import 'client-only';

import { FirebaseError } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  getRedirectResult,
  GoogleAuthProvider,
  linkWithCredential,
  linkWithPopup,
  linkWithRedirect,
  onIdTokenChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInAnonymously,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';

import { errorCode } from '@/lib/domain/auth/errors';
import type { SessionUser } from '@/lib/domain/auth/session';
import type { Locale } from '@/lib/domain/types';
import { getFirebaseClient } from '@/lib/firebase/client';

/**
 * Every Firebase Auth flow the app uses (DESIGN §9). UI code calls these functions and
 * never imports firebase/* itself (CLAUDE.md rule 3).
 */

export function toSessionUser(user: User): SessionUser {
  return {
    uid: user.uid,
    isAnonymous: user.isAnonymous,
    email: user.email,
    emailVerified: user.emailVerified,
    displayName: user.displayName,
    photoURL: user.photoURL,
    providerIds: user.providerData.map((p) => p.providerId),
  };
}

function auth() {
  return getFirebaseClient().auth;
}

/** Links in emails (verification, reset) come back to the app in the user's language. */
function actionUrl(locale: Locale, path: string): { url: string } {
  return { url: `${window.location.origin}/${locale}${path}` };
}

/**
 * Fires on sign-in, sign-out and token refresh. Linking a guest keeps the same uid, so
 * onAuthStateChanged would miss it; the token refresh after linking is what we observe.
 */
export function observeAuth(callback: (user: SessionUser | null) => void): () => void {
  return onIdTokenChanged(auth(), (user) => callback(user ? toSessionUser(user) : null));
}

export async function createGuest(): Promise<void> {
  await signInAnonymously(auth());
}

/** Makes the next ID token report the new sign-in method, which the rules check. */
async function refreshToken(): Promise<void> {
  await auth().currentUser?.getIdToken(true);
}

/** Sign-up keeps the guest's uid by linking (AUTH-04). */
export async function signUpWithEmail(
  input: { email: string; password: string; displayName?: string },
  locale: Locale,
): Promise<void> {
  const a = auth();
  a.languageCode = locale;
  const current = a.currentUser;
  const { user } = current?.isAnonymous
    ? await linkWithCredential(current, EmailAuthProvider.credential(input.email, input.password))
    : await createUserWithEmailAndPassword(a, input.email, input.password);
  if (input.displayName) await updateProfile(user, { displayName: input.displayName });
  await refreshToken();
  // AUTH-08: not awaited, so a slow mail service never blocks sign-up.
  void sendEmailVerification(user, actionUrl(locale, '/trees')).catch(() => undefined);
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(auth(), email, password);
}

function googleCredentialFrom(error: unknown) {
  return error instanceof FirebaseError ? GoogleAuthProvider.credentialFromError(error) : null;
}

function googleProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
}

/**
 * Continue with Google (AUTH-05/06). A guest links the Google account; if that account
 * already exists we sign in to it (the P3-06 merge ticket will move guest trees first).
 * Returns "redirecting" when the popup was blocked and a full-page redirect started.
 */
export async function continueWithGoogle(locale: Locale): Promise<'done' | 'redirecting'> {
  const a = auth();
  a.languageCode = locale;
  const provider = googleProvider();
  const current = a.currentUser;
  try {
    if (current?.isAnonymous) await linkWithPopup(current, provider);
    else await signInWithPopup(a, provider);
  } catch (error) {
    const code = errorCode(error);
    if (code === 'auth/credential-already-in-use') {
      const credential = googleCredentialFrom(error);
      if (!credential) throw error;
      await signInWithCredential(a, credential);
    } else if (code === 'auth/popup-blocked') {
      if (current?.isAnonymous) await linkWithRedirect(current, provider);
      else await signInWithRedirect(a, provider);
      return 'redirecting';
    } else {
      throw error;
    }
  }
  await refreshToken();
  return 'done';
}

/** Finishes a redirect sign-in after the page reloads. */
export async function completeRedirectSignIn(): Promise<void> {
  const a = auth();
  try {
    const result = await getRedirectResult(a);
    if (result) await refreshToken();
  } catch (error) {
    if (errorCode(error) !== 'auth/credential-already-in-use') throw error;
    const credential = googleCredentialFrom(error);
    if (credential) await signInWithCredential(a, credential);
  }
}

/** Always resolves the same way, so the form never reveals whether an account exists. */
export async function sendPasswordReset(email: string, locale: Locale): Promise<void> {
  const a = auth();
  a.languageCode = locale;
  try {
    await sendPasswordResetEmail(a, email, actionUrl(locale, '/login'));
  } catch (error) {
    if (errorCode(error) !== 'auth/user-not-found') throw error;
  }
}

export async function resendVerificationEmail(locale: Locale): Promise<void> {
  const a = auth();
  const user = a.currentUser;
  if (!user || user.emailVerified) return;
  a.languageCode = locale;
  await sendEmailVerification(user, actionUrl(locale, '/trees'));
}

/** Picks up a verification done in another tab or from the email link. */
export async function refreshVerification(): Promise<void> {
  const user = auth().currentUser;
  if (!user || user.isAnonymous || user.emailVerified) return;
  await reload(user);
  if (user.emailVerified) await refreshToken();
}

export async function updateDisplayName(displayName: string): Promise<void> {
  const user = auth().currentUser;
  if (!user) return;
  await updateProfile(user, { displayName });
  await refreshToken();
}

export async function signOutUser(): Promise<void> {
  await signOut(auth());
}
