import { describe, expect, it } from 'vitest';

import { authErrorKey, errorCode, isOfflineError } from './errors';

describe('authErrorKey', () => {
  it.each([
    ['auth/email-already-in-use', 'emailInUse'],
    ['auth/invalid-credential', 'invalidCredentials'],
    ['auth/wrong-password', 'invalidCredentials'],
    ['auth/weak-password', 'weakPassword'],
    ['auth/popup-closed-by-user', 'popupClosed'],
    ['auth/credential-already-in-use', 'credentialInUse'],
    ['auth/network-request-failed', 'network'],
  ])('maps %s to %s', (code, key) => {
    expect(authErrorKey({ code })).toBe(key);
  });

  it('falls back to "unknown"', () => {
    expect(authErrorKey({ code: 'auth/something-new' })).toBe('unknown');
    expect(authErrorKey(new Error('boom'))).toBe('unknown');
    expect(authErrorKey(null)).toBe('unknown');
  });
});

describe('errorCode', () => {
  it('reads string codes only', () => {
    expect(errorCode({ code: 'auth/x' })).toBe('auth/x');
    expect(errorCode({ code: 42 })).toBe('unknown');
    expect(errorCode('auth/x')).toBe('unknown');
  });
});

describe('isOfflineError', () => {
  it('recognises network failures', () => {
    expect(isOfflineError({ code: 'auth/network-request-failed' })).toBe(true);
    expect(isOfflineError({ code: 'unavailable' })).toBe(true);
    expect(isOfflineError({ code: 'auth/invalid-credential' })).toBe(false);
  });
});
