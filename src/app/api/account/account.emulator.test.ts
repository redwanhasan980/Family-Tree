import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_TREE_SETTINGS } from '@/lib/domain/schemas';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { createMergeTicket } from '@/lib/server/merge';
import {
  apiRequest,
  clearAuthEmulator,
  createEmailUser,
  createGuestUser,
  linkEmail,
  type TestUser,
} from '@/lib/server/testing/authEmulator';

import { POST as deleteAccount } from './delete/route';
import { POST as merge } from './merge/route';
import { POST as mergeTicket } from './merge-ticket/route';

const db = () => getAdminDb();
let emails = 0;
const email = () => `user${++emails}-${Date.now()}@example.com`;

async function seedTree(treeId: string, ownerId: string, members: Record<string, string> = {}) {
  const roles = { [ownerId]: 'owner', ...members };
  const at = new Date('2026-01-01T00:00:00Z');
  await db()
    .doc(`trees/${treeId}`)
    .set({
      name: treeId,
      ownerId,
      memberIds: Object.keys(roles),
      roles,
      personCount: 1,
      settings: DEFAULT_TREE_SETTINGS,
      createdAt: at,
      updatedAt: at,
      updatedBy: ownerId,
      schemaVersion: 1,
    });
  await db()
    .doc(`trees/${treeId}/persons/p1`)
    .set({ names: { en: 'A' }, gender: 'male' });
}

async function seedProfile(uid: string, isGuest: boolean) {
  await db().doc(`users/${uid}`).set({ isGuest, locale: 'bn', theme: 'system' });
}

const exists = async (path: string) => (await db().doc(path).get()).exists;
const ownerOf = async (treeId: string) => (await db().doc(`trees/${treeId}`).get()).get('ownerId');

async function authUserExists(uid: string): Promise<boolean> {
  try {
    await getAdminAuth().getUser(uid);
    return true;
  } catch {
    return false;
  }
}

async function call(
  handler: (request: Request, context: unknown) => Promise<Response>,
  user: TestUser | undefined,
  body: unknown,
) {
  const response = await handler(apiRequest('/api/account', { user, body }), {});
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function clearDb() {
  for (const name of ['trees', 'users', 'mergeTickets', 'rateLimits']) {
    await db().recursiveDelete(db().collection(name));
  }
}

beforeEach(async () => {
  await clearDb();
  await clearAuthEmulator();
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await clearDb();
  await clearAuthEmulator();
});

describe('POST /api/account/merge-ticket', () => {
  it('gives a guest a ticket that expires in a day', async () => {
    const guest = await createGuestUser();
    const { status, body } = await call(mergeTicket, guest, {});
    expect(status).toBe(201);
    const ticket = (
      await db()
        .doc(`mergeTickets/${body.ticketId as string}`)
        .get()
    ).data()!;
    expect(ticket).toMatchObject({ guestUid: guest.uid, used: false });
    const hours = (Date.parse(body.expiresAt as string) - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(23.9);
    expect(hours).toBeLessThanOrEqual(24);
  });

  it('refuses registered users, missing tokens and unknown fields', async () => {
    const user = await createEmailUser(email());
    expect(await call(mergeTicket, user, {})).toMatchObject({
      status: 403,
      body: { error: { code: 'forbidden' } },
    });
    expect((await call(mergeTicket, undefined, {})).status).toBe(401);
    expect((await call(mergeTicket, await createGuestUser(), { guestUid: 'x' })).status).toBe(400);
  });

  it('limits a guest to 10 tickets an hour', async () => {
    const guest = await createGuestUser();
    for (let i = 0; i < 10; i++) expect((await call(mergeTicket, guest, {})).status).toBe(201);
    expect(await call(mergeTicket, guest, {})).toMatchObject({
      status: 429,
      body: { error: { code: 'rate_limited' } },
    });
    expect((await call(mergeTicket, await createGuestUser(), {})).status).toBe(201);
  });
});

describe('POST /api/account/merge (AUTH-07)', () => {
  it('moves and discards the guest’s trees, deletes the guest, and repeats its answer', async () => {
    const guest = await createGuestUser();
    const user = await createEmailUser(email());
    await seedProfile(guest.uid, true);
    await seedTree('keep', guest.uid);
    await seedTree('drop', guest.uid);
    await seedTree('mine', user.uid);
    await seedTree('theirs', 'someone', { [guest.uid]: 'viewer' });
    const { ticketId } = await createMergeTicket(guest.uid);

    const decisions = [{ treeId: 'drop', action: 'discard' }];
    const first = await call(merge, user, { ticketId, decisions });
    expect(first).toEqual({ status: 200, body: { moved: ['keep'], discarded: ['drop'] } });

    expect(await ownerOf('keep')).toBe(user.uid);
    expect((await db().doc('trees/keep').get()).get('roles')).toEqual({ [user.uid]: 'owner' });
    expect(await exists('trees/drop')).toBe(false);
    expect(await exists('trees/drop/persons/p1')).toBe(false);
    expect(await ownerOf('mine')).toBe(user.uid);
    expect((await db().doc('trees/theirs').get()).get('memberIds')).toEqual(['someone']);
    expect(await exists(`users/${guest.uid}`)).toBe(false);
    expect(await authUserExists(guest.uid)).toBe(false);

    // A retry (say, after a lost response) gets the same answer and changes nothing.
    expect(await call(merge, user, { ticketId, decisions: [] })).toEqual(first);
    expect(await ownerOf('keep')).toBe(user.uid);
  });

  it('finishes a merge that was interrupted, with its original decisions', async () => {
    const guest = await createGuestUser();
    const user = await createEmailUser(email());
    await seedTree('a', guest.uid);
    await seedTree('b', guest.uid);
    const { ticketId } = await createMergeTicket(guest.uid);
    // As if a first attempt claimed the ticket and moved "a" before failing.
    await db()
      .doc(`mergeTickets/${ticketId}`)
      .update({
        claimedBy: user.uid,
        treeIds: ['a', 'b'],
        decisions: [{ treeId: 'b', action: 'discard' }],
      });
    await db()
      .doc('trees/a')
      .update({ ownerId: user.uid, memberIds: [user.uid], roles: { [user.uid]: 'owner' } });

    expect(await call(merge, user, { ticketId, decisions: [] })).toEqual({
      status: 200,
      body: { moved: ['a'], discarded: ['b'] },
    });
    expect(await authUserExists(guest.uid)).toBe(false);
  });

  it('refuses unknown, expired and already used tickets, and guests', async () => {
    const guest = await createGuestUser();
    const user = await createEmailUser(email());
    const other = await createEmailUser(email());

    expect(await call(merge, user, { ticketId: 'nope', decisions: [] })).toMatchObject({
      status: 404,
      body: { error: { code: 'not_found' } },
    });

    const old = await createMergeTicket(guest.uid, new Date(Date.now() - 25 * 3_600_000));
    expect(await call(merge, user, { ticketId: old.ticketId, decisions: [] })).toMatchObject({
      status: 410,
      body: { error: { code: 'expired' } },
    });

    const { ticketId } = await createMergeTicket(guest.uid);
    expect(await call(merge, await createGuestUser(), { ticketId, decisions: [] })).toMatchObject({
      status: 403,
      body: { error: { code: 'guest_not_allowed' } },
    });
    expect((await call(merge, user, { ticketId, decisions: [] })).status).toBe(200);
    expect(await call(merge, other, { ticketId, decisions: [] })).toMatchObject({
      status: 409,
      body: { error: { code: 'conflict' } },
    });
  });

  it('never merges away a guest that has since become an account', async () => {
    const guest = await createGuestUser();
    const user = await createEmailUser(email());
    await seedTree('t', guest.uid);
    const { ticketId } = await createMergeTicket(guest.uid);
    await linkEmail(guest.idToken, email());

    expect(await call(merge, user, { ticketId, decisions: [] })).toMatchObject({
      status: 409,
      body: { error: { code: 'conflict' } },
    });
    expect(await ownerOf('t')).toBe(guest.uid);
    expect(await authUserExists(guest.uid)).toBe(true);
  });
});

describe('POST /api/account/delete (AUTH-10/12)', () => {
  it('deletes a guest’s data and leaves nothing behind', async () => {
    const guest = await createGuestUser();
    await seedProfile(guest.uid, true);
    await seedTree('t', guest.uid);
    await createMergeTicket(guest.uid);
    expect((await call(mergeTicket, guest, {})).status).toBe(201);

    expect(await call(deleteAccount, guest, { confirm: true })).toEqual({
      status: 200,
      body: { ok: true },
    });
    expect(await exists('trees/t')).toBe(false);
    expect(await exists('trees/t/persons/p1')).toBe(false);
    expect(await exists(`users/${guest.uid}`)).toBe(false);
    expect(await authUserExists(guest.uid)).toBe(false);
    for (const name of ['trees', 'users', 'mergeTickets', 'rateLimits']) {
      expect((await db().collection(name).get()).size, name).toBe(0);
    }
  });

  it('deletes an account after a recent sign-in and leaves trees shared with it', async () => {
    const user = await createEmailUser(email());
    await seedProfile(user.uid, false);
    await seedTree('mine', user.uid, { friend: 'editor' });
    await seedTree('shared', 'friend', { [user.uid]: 'editor' });

    expect((await call(deleteAccount, user, { confirm: true })).status).toBe(200);
    expect(await exists('trees/mine')).toBe(false);
    const shared = (await db().doc('trees/shared').get()).data()!;
    expect(shared.memberIds).toEqual(['friend']);
    expect(shared.roles).toEqual({ friend: 'owner' });
    expect(await exists(`users/${user.uid}`)).toBe(false);
    expect(await authUserExists(user.uid)).toBe(false);
    // The deleted user's token no longer works.
    expect((await call(deleteAccount, user, { confirm: true })).status).toBe(401);
  });

  it('asks a registered user to sign in again after five minutes', async () => {
    const user = await createEmailUser(email());
    await seedTree('mine', user.uid);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 6 * 60 * 1000);

    expect(await call(deleteAccount, user, { confirm: true })).toMatchObject({
      status: 403,
      body: { error: { code: 'reauth_required' } },
    });
    expect(await exists('trees/mine')).toBe(true);
  });

  it('needs the confirmation flag', async () => {
    const guest = await createGuestUser();
    expect((await call(deleteAccount, guest, {})).status).toBe(400);
    expect(await authUserExists(guest.uid)).toBe(true);
  });
});
