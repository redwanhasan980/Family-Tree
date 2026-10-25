import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SessionState } from '@/lib/domain/auth/session';

import { useUpgradePrompt, useVisitCount } from './useUpgradePrompt';

const state = vi.hoisted(() => ({ session: { status: 'restoring' } as SessionState }));

vi.mock('./SessionProvider', () => ({ useSession: () => ({ session: state.session }) }));

const guest: SessionState = {
  status: 'guest',
  user: {
    uid: 'g1',
    isAnonymous: true,
    email: null,
    emailVerified: false,
    displayName: null,
    photoURL: null,
    providerIds: [],
  },
};

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-10-22T10:00:00Z'), toFake: ['Date'] });
  window.localStorage.clear();
  state.session = guest;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useUpgradePrompt', () => {
  it('shows prompts to guests until they dismiss them', () => {
    const { result } = renderHook(() => useUpgradePrompt('fifthPerson'));
    expect(result.current.visible).toBe(true);
    act(() => result.current.dismiss());
    expect(result.current.visible).toBe(false);
  });

  it('brings a dismissed prompt back after 7 days', () => {
    const sixDaysAgo = Date.now() - 6 * 24 * 60 * 60 * 1000;
    window.localStorage.setItem('shikor:prompt:thirdVisit:dismissedAt', String(sixDaysAgo));
    expect(renderHook(() => useUpgradePrompt('thirdVisit')).result.current.visible).toBe(false);

    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    window.localStorage.setItem('shikor:prompt:thirdVisit:dismissedAt', String(eightDaysAgo));
    expect(renderHook(() => useUpgradePrompt('thirdVisit')).result.current.visible).toBe(true);
  });

  it('keeps each prompt separate', () => {
    const first = renderHook(() => useUpgradePrompt('firstExport'));
    act(() => first.result.current.dismiss());
    expect(renderHook(() => useUpgradePrompt('fifthPerson')).result.current.visible).toBe(true);
  });

  it('never shows prompts to registered users or before the session is known', () => {
    state.session = { status: 'registered', user: { ...guest.user, isAnonymous: false } };
    expect(renderHook(() => useUpgradePrompt('fifthPerson')).result.current.visible).toBe(false);
    state.session = { status: 'restoring' };
    expect(renderHook(() => useUpgradePrompt('fifthPerson')).result.current.visible).toBe(false);
  });

  it('still works when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { result } = renderHook(() => useUpgradePrompt('fifthPerson'));
    expect(result.current.visible).toBe(true);
    expect(() => act(() => result.current.dismiss())).not.toThrow();
  });
});

describe('useVisitCount', () => {
  it('counts one visit a day in this browser', () => {
    expect(renderHook(() => useVisitCount()).result.current).toBe(1);
    expect(renderHook(() => useVisitCount()).result.current).toBe(1);
    vi.setSystemTime(new Date('2026-10-24T10:00:00Z'));
    expect(renderHook(() => useVisitCount()).result.current).toBe(2);
  });

  it('starts again from a broken record', () => {
    window.localStorage.setItem('shikor:visits', '{"count":"many"}');
    expect(renderHook(() => useVisitCount()).result.current).toBe(1);
  });
});
