import { describe, expect, it } from 'vitest';

import {
  hasUser,
  INITIAL_SESSION,
  retryDelayMs,
  sessionReducer,
  type SessionState,
  type SessionUser,
} from './session';

const guest: SessionUser = {
  uid: 'g1',
  isAnonymous: true,
  email: null,
  emailVerified: false,
  displayName: null,
  photoURL: null,
  providerIds: [],
};
const member: SessionUser = {
  ...guest,
  uid: 'u1',
  isAnonymous: false,
  email: 'a@b.co',
  providerIds: ['password'],
};

describe('sessionReducer', () => {
  it('restores a persisted guest', () => {
    expect(sessionReducer(INITIAL_SESSION, { type: 'AUTH_CHANGED', user: guest })).toEqual({
      status: 'guest',
      user: guest,
    });
  });

  it('restores a registered user', () => {
    expect(sessionReducer(INITIAL_SESSION, { type: 'AUTH_CHANGED', user: member }).status).toBe(
      'registered',
    );
  });

  it('is signed out when nothing is persisted', () => {
    expect(sessionReducer(INITIAL_SESSION, { type: 'AUTH_CHANGED', user: null })).toEqual({
      status: 'signedOut',
    });
  });

  it('creates a guest when requested, counting attempts', () => {
    const creating = sessionReducer({ status: 'signedOut' }, { type: 'GUEST_REQUESTED' });
    expect(creating).toEqual({ status: 'creatingGuest', attempt: 1 });
  });

  it('keeps creating while Firebase still reports no user', () => {
    const creating: SessionState = { status: 'creatingGuest', attempt: 1 };
    expect(sessionReducer(creating, { type: 'AUTH_CHANGED', user: null })).toBe(creating);
  });

  it('goes offline on network failure and retries with the next attempt number', () => {
    const offline = sessionReducer(
      { status: 'creatingGuest', attempt: 2 },
      { type: 'GUEST_FAILED', offline: true, code: 'auth/network-request-failed' },
    );
    expect(offline).toEqual({ status: 'offline', attempt: 2 });
    expect(sessionReducer(offline, { type: 'GUEST_REQUESTED' })).toEqual({
      status: 'creatingGuest',
      attempt: 3,
    });
  });

  it('records other failures as errors that can be retried', () => {
    const error = sessionReducer(
      { status: 'creatingGuest', attempt: 1 },
      { type: 'GUEST_FAILED', offline: false, code: 'auth/operation-not-allowed' },
    );
    expect(error).toEqual({ status: 'error', code: 'auth/operation-not-allowed', attempt: 1 });
    expect(sessionReducer(error, { type: 'GUEST_REQUESTED' })).toEqual({
      status: 'creatingGuest',
      attempt: 2,
    });
  });

  it('ignores guest requests and failures in other states', () => {
    const state: SessionState = { status: 'guest', user: guest };
    expect(sessionReducer(state, { type: 'GUEST_REQUESTED' })).toBe(state);
    expect(sessionReducer(state, { type: 'GUEST_FAILED', offline: true, code: 'x' })).toBe(state);
  });

  it('becomes registered when a guest links an account (same uid)', () => {
    const linked = sessionReducer(
      { status: 'guest', user: guest },
      { type: 'AUTH_CHANGED', user: { ...member, uid: 'g1' } },
    );
    expect(linked).toEqual({ status: 'registered', user: { ...member, uid: 'g1' } });
  });

  it('is signed out after signing out', () => {
    expect(
      sessionReducer({ status: 'registered', user: member }, { type: 'AUTH_CHANGED', user: null }),
    ).toEqual({ status: 'signedOut' });
  });
});

describe('hasUser', () => {
  it('is true only for guests and registered users', () => {
    expect(hasUser({ status: 'guest', user: guest })).toBe(true);
    expect(hasUser({ status: 'registered', user: member })).toBe(true);
    expect(hasUser({ status: 'restoring' })).toBe(false);
    expect(hasUser({ status: 'offline', attempt: 1 })).toBe(false);
  });
});

describe('retryDelayMs', () => {
  it('backs off exponentially up to 30 seconds', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(retryDelayMs)).toEqual([
      1000, 2000, 4000, 8000, 16000, 30000, 30000,
    ]);
    expect(retryDelayMs(0)).toBe(1000);
  });
});
