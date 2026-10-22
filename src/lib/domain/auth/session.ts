/**
 * Session state machine (DESIGN §9.2). Pure: the auth provider feeds it Firebase events,
 * and the gate reads it to decide when to create a guest or show a skeleton.
 */

export interface SessionUser {
  uid: string;
  isAnonymous: boolean;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  photoURL: string | null;
  /** Linked sign-in methods, for example ["password"] or ["google.com"]. */
  providerIds: string[];
}

export type SessionState =
  | { status: 'restoring' }
  | { status: 'signedOut' }
  | { status: 'creatingGuest'; attempt: number }
  | { status: 'offline'; attempt: number }
  | { status: 'error'; code: string; attempt: number }
  | { status: 'guest'; user: SessionUser }
  | { status: 'registered'; user: SessionUser };

export type SessionEvent =
  | { type: 'AUTH_CHANGED'; user: SessionUser | null }
  | { type: 'GUEST_REQUESTED' }
  | { type: 'GUEST_FAILED'; offline: boolean; code: string };

export const INITIAL_SESSION: SessionState = { status: 'restoring' };

function attemptsSoFar(state: SessionState): number {
  return 'attempt' in state ? state.attempt : 0;
}

export function sessionReducer(state: SessionState, event: SessionEvent): SessionState {
  switch (event.type) {
    case 'AUTH_CHANGED':
      if (event.user) {
        return event.user.isAnonymous
          ? { status: 'guest', user: event.user }
          : { status: 'registered', user: event.user };
      }
      // While a guest is being created, Firebase may still report "no user".
      return state.status === 'creatingGuest' ? state : { status: 'signedOut' };

    case 'GUEST_REQUESTED':
      if (state.status === 'signedOut' || state.status === 'offline' || state.status === 'error') {
        return { status: 'creatingGuest', attempt: attemptsSoFar(state) + 1 };
      }
      return state;

    case 'GUEST_FAILED':
      if (state.status !== 'creatingGuest') return state;
      return event.offline
        ? { status: 'offline', attempt: state.attempt }
        : { status: 'error', code: event.code, attempt: state.attempt };

    default: {
      const unreachable: never = event;
      return unreachable;
    }
  }
}

/** True once a user (guest or registered) is available. */
export function hasUser(
  state: SessionState,
): state is Extract<SessionState, { status: 'guest' | 'registered' }> {
  return state.status === 'guest' || state.status === 'registered';
}

/** Exponential backoff for guest creation: 1 s, 2 s, 4 s … capped at 30 s. */
export function retryDelayMs(attempt: number): number {
  return Math.min(30_000, 1_000 * 2 ** Math.max(0, attempt - 1));
}
