/** Maps Firebase Auth error codes to keys in the `authErrors` message namespace. */
export type AuthErrorKey =
  | 'emailInUse'
  | 'credentialInUse'
  | 'invalidCredentials'
  | 'weakPassword'
  | 'invalidEmail'
  | 'tooManyRequests'
  | 'network'
  | 'popupBlocked'
  | 'popupClosed'
  | 'differentCredential'
  | 'requiresRecentLogin'
  | 'userDisabled'
  | 'notAllowed'
  | 'unknown';

const CODES: Record<string, AuthErrorKey> = {
  'auth/email-already-in-use': 'emailInUse',
  'auth/credential-already-in-use': 'credentialInUse',
  'auth/provider-already-linked': 'credentialInUse',
  'auth/invalid-credential': 'invalidCredentials',
  'auth/invalid-login-credentials': 'invalidCredentials',
  'auth/wrong-password': 'invalidCredentials',
  'auth/user-not-found': 'invalidCredentials',
  'auth/weak-password': 'weakPassword',
  'auth/password-does-not-meet-requirements': 'weakPassword',
  'auth/invalid-email': 'invalidEmail',
  'auth/missing-email': 'invalidEmail',
  'auth/too-many-requests': 'tooManyRequests',
  'auth/network-request-failed': 'network',
  'auth/popup-blocked': 'popupBlocked',
  'auth/popup-closed-by-user': 'popupClosed',
  'auth/cancelled-popup-request': 'popupClosed',
  'auth/user-cancelled': 'popupClosed',
  'auth/account-exists-with-different-credential': 'differentCredential',
  'auth/requires-recent-login': 'requiresRecentLogin',
  'auth/user-disabled': 'userDisabled',
  'auth/operation-not-allowed': 'notAllowed',
  'auth/admin-restricted-operation': 'notAllowed',
};

export function errorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const { code } = error as { code: unknown };
    if (typeof code === 'string') return code;
  }
  return 'unknown';
}

export function authErrorKey(error: unknown): AuthErrorKey {
  return CODES[errorCode(error)] ?? 'unknown';
}

/** Network failures are retried silently instead of shown as errors. */
export function isOfflineError(error: unknown): boolean {
  const code = errorCode(error);
  return code === 'auth/network-request-failed' || code === 'unavailable';
}
