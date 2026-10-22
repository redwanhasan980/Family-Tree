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
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

import { EDITOR, OUTSIDER, OWNER, seedDoc, seedTree, VIEWER } from './data';
import { guestDb, memberDb, startEnv, userDb } from './helpers';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await startEnv();
});
beforeEach(async () => {
  await env.clearFirestore();
  await seedTree(env);
});
afterAll(async () => {
  await env?.cleanup();
});

describe('activity log (R3)', () => {
  const entry = (uid: string, overrides: Record<string, unknown> = {}) => ({
    actorId: uid,
    action: 'addChildren',
    targetType: 'person',
    targetId: 'p1',
    summary: '3 children added',
    at: serverTimestamp(),
    ...overrides,
  });
  const ref = (uid: string, id = 'a1') => doc(userDb(env, uid), `trees/t1/activity/${id}`);

  it('lets editors append their own entries', async () => {
    await assertSucceeds(setDoc(ref(EDITOR), entry(EDITOR)));
    await assertFails(setDoc(ref(EDITOR, 'a2'), entry(OWNER)));
    await assertFails(setDoc(ref(EDITOR, 'a3'), entry(EDITOR, { at: Timestamp.now() })));
    await assertFails(setDoc(ref(EDITOR, 'a4'), entry(EDITOR, { targetType: 'photo' })));
    await assertFails(setDoc(ref(EDITOR, 'a5'), entry(EDITOR, { extra: 1 })));
    await assertFails(setDoc(ref(VIEWER, 'a6'), entry(VIEWER)));
  });

  it('is append-only and readable by members', async () => {
    await seedDoc(env, 'trees/t1/activity/a1', { ...entry(OWNER), at: Timestamp.now() });
    await assertFails(updateDoc(ref(OWNER), { summary: 'x' }));
    await assertFails(deleteDoc(ref(OWNER)));
    await assertSucceeds(getDoc(ref(VIEWER)));
    await assertFails(getDoc(ref(OUTSIDER)));
  });
});

describe('share links (R3)', () => {
  const link = (uid: string, overrides: Record<string, unknown> = {}) => ({
    treeId: 't1',
    createdBy: uid,
    createdAt: serverTimestamp(),
    enabled: true,
    options: { hideContactInfo: true, hideLivingDetails: false, allowExport: true },
    ...overrides,
  });
  const ref = (uid: string, id = 'share1') => doc(userDb(env, uid), `shareLinks/${id}`);

  it('only the tree owner creates links, as themselves', async () => {
    await assertSucceeds(setDoc(ref(OWNER), link(OWNER)));
    await assertFails(setDoc(ref(EDITOR, 's2'), link(EDITOR)));
    await assertFails(setDoc(ref(OWNER, 's3'), link(EDITOR)));
    await assertFails(setDoc(ref(OWNER, 's4'), link(OWNER, { createdAt: Timestamp.now() })));
    await assertFails(setDoc(ref(OWNER, 's5'), link(OWNER, { options: { showEverything: true } })));
  });

  it('lets the creator read, toggle and delete it; nobody else', async () => {
    await seedDoc(env, 'shareLinks/share1', { ...link(OWNER), createdAt: Timestamp.now() });
    await assertSucceeds(getDoc(ref(OWNER)));
    await assertFails(getDoc(ref(EDITOR)));
    await assertSucceeds(updateDoc(ref(OWNER), { enabled: false }));
    await assertFails(updateDoc(ref(OWNER), { treeId: 't9' }));
    await assertFails(updateDoc(ref(EDITOR), { enabled: true }));
    await assertFails(deleteDoc(ref(EDITOR)));
    await assertSucceeds(deleteDoc(ref(OWNER)));
  });
});

describe('invites (R3)', () => {
  const invite = (uid: string, overrides: Record<string, unknown> = {}) => ({
    treeId: 't1',
    role: 'editor',
    createdBy: uid,
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 7 * 86_400_000),
    maxUses: 5,
    uses: 0,
    revoked: false,
    ...overrides,
  });

  it('only a verified, registered owner creates invites', async () => {
    const ownerDb = userDb(env, OWNER);
    await assertSucceeds(setDoc(doc(ownerDb, 'invites/i1'), invite(OWNER)));
    await assertFails(
      setDoc(doc(memberDb(env, OWNER, 'own@example.com'), 'invites/i2'), invite(OWNER)),
    );
    await seedTree(env, 'gt', { ownerId: 'gst', memberIds: ['gst'], roles: { gst: 'owner' } });
    await assertFails(
      setDoc(doc(guestDb(env, 'gst'), 'invites/i3'), invite('gst', { treeId: 'gt' })),
    );
    await assertFails(setDoc(doc(userDb(env, EDITOR), 'invites/i4'), invite(EDITOR)));
  });

  it('refuses owner roles, used, revoked, expired or unbounded invites', async () => {
    const db = userDb(env, OWNER);
    const bad: Record<string, unknown>[] = [
      { role: 'owner' },
      { uses: 1 },
      { revoked: true },
      { expiresAt: Timestamp.fromMillis(Date.now() - 1000) },
      { maxUses: 0 },
      { maxUses: 1000 },
      { createdBy: EDITOR },
      { extra: true },
    ];
    for (const [i, overrides] of bad.entries()) {
      await assertFails(setDoc(doc(db, `invites/bad${i}`), invite(OWNER, overrides)));
    }
  });

  it('is never updated by clients; only its creator reads or deletes it', async () => {
    await seedDoc(env, 'invites/i1', { ...invite(OWNER), createdAt: Timestamp.now() });
    await assertFails(updateDoc(doc(userDb(env, OUTSIDER), 'invites/i1'), { uses: 1 }));
    await assertFails(updateDoc(doc(userDb(env, OWNER), 'invites/i1'), { revoked: true }));
    await assertFails(getDoc(doc(userDb(env, OUTSIDER), 'invites/i1')));
    await assertSucceeds(getDoc(doc(userDb(env, OWNER), 'invites/i1')));
    await assertSucceeds(deleteDoc(doc(userDb(env, OWNER), 'invites/i1')));
  });
});
