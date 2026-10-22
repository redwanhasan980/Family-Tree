import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  type Firestore,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

import { guestDb, memberDb, startEnv } from './helpers';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await startEnv();
});

beforeEach(async () => {
  await env.clearFirestore();
});

afterAll(async () => {
  await env?.cleanup();
});

/**
 * A client-chosen time a minute in the past. Timestamp.now() is not used, because it can
 * land in the same millisecond as request.time on a fast emulator, and the rule then
 * rightly accepts it.
 */
function clientTime() {
  return Timestamp.fromMillis(Date.now() - 60_000);
}

function profile(overrides: Record<string, unknown> = {}) {
  return {
    isGuest: true,
    locale: 'bn',
    theme: 'system',
    selfPersonIds: {},
    onboardingCompleted: false,
    createdAt: serverTimestamp(),
    lastActiveAt: serverTimestamp(),
    schemaVersion: 1,
    ...overrides,
  };
}

/** Seeds a profile, bypassing rules, as if created earlier. */
async function seed(uid: string, data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore() as unknown as Firestore, `users/${uid}`), {
      locale: 'bn',
      theme: 'system',
      selfPersonIds: {},
      onboardingCompleted: false,
      createdAt: Timestamp.fromDate(new Date('2026-01-01')),
      lastActiveAt: Timestamp.fromDate(new Date('2026-01-01')),
      schemaVersion: 1,
      ...data,
    });
  });
}

describe('users/{uid} — create', () => {
  it('lets a guest create their own guest profile', async () => {
    await assertSucceeds(setDoc(doc(guestDb(env, 'g1'), 'users/g1'), profile()));
  });

  it('lets a registered user create a profile with their own email', async () => {
    const db = memberDb(env, 'u1', 'nadia@example.com');
    await assertSucceeds(
      setDoc(
        doc(db, 'users/u1'),
        profile({ isGuest: false, email: 'nadia@example.com', displayName: 'নাদিয়া' }),
      ),
    );
  });

  it('rejects a guest pretending to be registered, and the reverse', async () => {
    await assertFails(setDoc(doc(guestDb(env, 'g1'), 'users/g1'), profile({ isGuest: false })));
    await assertFails(
      setDoc(doc(memberDb(env, 'u1', 'a@b.co'), 'users/u1'), profile({ isGuest: true })),
    );
  });

  it("rejects someone else's email", async () => {
    const db = memberDb(env, 'u1', 'a@b.co', 'google.com');
    await assertFails(
      setDoc(doc(db, 'users/u1'), profile({ isGuest: false, email: 'other@b.co' })),
    );
  });

  it("rejects writing another user's profile", async () => {
    await assertFails(setDoc(doc(guestDb(env, 'g1'), 'users/g2'), profile()));
  });

  it('rejects unauthenticated writes', async () => {
    await assertFails(setDoc(doc(env.unauthenticatedContext().firestore(), 'users/g1'), profile()));
  });

  it('rejects client-chosen timestamps', async () => {
    const db = guestDb(env, 'g1');
    await assertFails(setDoc(doc(db, 'users/g1'), profile({ createdAt: clientTime() })));
    await assertFails(setDoc(doc(db, 'users/g1'), profile({ lastActiveAt: clientTime() })));
  });

  it.each([
    ['unknown field', { role: 'admin' }],
    ['bad locale', { locale: 'fr' }],
    ['bad theme', { theme: 'blue' }],
    ['long name', { displayName: 'x'.repeat(81) }],
    ['non-string name', { displayName: 42 }],
    ['selfPersonIds not a map', { selfPersonIds: 'p1' }],
    ['onboardingCompleted not a bool', { onboardingCompleted: 'yes' }],
    ['wrong schema version', { schemaVersion: 2 }],
  ])('rejects a profile with %s', async (_case, overrides) => {
    await assertFails(setDoc(doc(guestDb(env, 'g1'), 'users/g1'), profile(overrides)));
  });

  it('rejects a profile missing required fields', async () => {
    const { theme: _theme, ...withoutTheme } = profile();
    await assertFails(setDoc(doc(guestDb(env, 'g1'), 'users/g1'), withoutTheme));
  });
});

describe('users/{uid} — read', () => {
  it('lets users read only their own profile', async () => {
    await seed('g1', { isGuest: true });
    await assertSucceeds(getDoc(doc(guestDb(env, 'g1'), 'users/g1')));
    await assertFails(getDoc(doc(guestDb(env, 'g2'), 'users/g1')));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'users/g1')));
  });
});

describe('users/{uid} — update', () => {
  it('lets a user change name, language and theme', async () => {
    await seed('u1', { isGuest: false, email: 'a@b.co' });
    const db = memberDb(env, 'u1', 'a@b.co');
    await assertSucceeds(
      updateDoc(doc(db, 'users/u1'), { displayName: 'Rahim', locale: 'en', theme: 'dark' }),
    );
  });

  it('marks a guest as registered once the token is no longer anonymous', async () => {
    await seed('g1', { isGuest: true });
    const linked = memberDb(env, 'g1', 'g1@example.com');
    await assertSucceeds(
      updateDoc(doc(linked, 'users/g1'), { isGuest: false, email: 'g1@example.com' }),
    );
  });

  it('refuses a stale guest flag after linking', async () => {
    await seed('g1', { isGuest: true });
    const linked = memberDb(env, 'g1', 'g1@example.com');
    await assertFails(updateDoc(doc(linked, 'users/g1'), { locale: 'en' }));
  });

  it('only accepts the server time for lastActiveAt', async () => {
    await seed('g1', { isGuest: true });
    const db = guestDb(env, 'g1');
    await assertSucceeds(updateDoc(doc(db, 'users/g1'), { lastActiveAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db, 'users/g1'), { lastActiveAt: clientTime() }));
  });

  it('never lets createdAt change', async () => {
    await seed('g1', { isGuest: true });
    await assertFails(
      updateDoc(doc(guestDb(env, 'g1'), 'users/g1'), { createdAt: serverTimestamp() }),
    );
  });

  it("rejects updates to someone else's profile", async () => {
    await seed('g1', { isGuest: true });
    await assertFails(updateDoc(doc(guestDb(env, 'g2'), 'users/g1'), { theme: 'dark' }));
  });
});

describe('users/{uid} — delete', () => {
  it('is server-only', async () => {
    await seed('g1', { isGuest: true });
    await assertFails(deleteDoc(doc(guestDb(env, 'g1'), 'users/g1')));
  });
});
