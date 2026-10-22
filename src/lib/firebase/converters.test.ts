import { Timestamp, type DocumentSnapshot } from 'firebase/firestore';
import { describe, expect, it } from 'vitest';

import { userFromSnapshot } from './converters';

function snap(id: string, data: Record<string, unknown> | null): DocumentSnapshot {
  return {
    id,
    exists: () => data !== null,
    data: () => data ?? undefined,
  } as unknown as DocumentSnapshot;
}

describe('userFromSnapshot', () => {
  it('returns null for a missing document', () => {
    expect(userFromSnapshot(snap('u1', null))).toBeNull();
  });

  it('converts a full profile', () => {
    const created = new Date('2026-10-01T00:00:00Z');
    const profile = userFromSnapshot(
      snap('u1', {
        isGuest: false,
        displayName: 'রহিম',
        email: 'a@b.co',
        locale: 'en',
        theme: 'dark',
        selfPersonIds: { t1: 'p1' },
        onboardingCompleted: true,
        createdAt: Timestamp.fromDate(created),
        lastActiveAt: Timestamp.fromDate(created),
        schemaVersion: 1,
      }),
    );
    expect(profile).toMatchObject({
      uid: 'u1',
      isGuest: false,
      displayName: 'রহিম',
      email: 'a@b.co',
      locale: 'en',
      theme: 'dark',
      selfPersonIds: { t1: 'p1' },
      onboardingCompleted: true,
      createdAt: created,
    });
  });

  it('falls back to safe defaults for malformed data', () => {
    const profile = userFromSnapshot(
      snap('g1', { locale: 'fr', theme: 'blue', displayName: '', selfPersonIds: 'x' }),
    );
    expect(profile).toMatchObject({
      isGuest: true,
      locale: 'bn',
      theme: 'system',
      displayName: undefined,
      selfPersonIds: {},
      onboardingCompleted: false,
    });
    expect(profile?.createdAt).toBeInstanceOf(Date);
  });
});
