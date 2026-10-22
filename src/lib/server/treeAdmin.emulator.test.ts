import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_TREE_SETTINGS } from '@/lib/domain/schemas';
import { getAdminDb } from '@/lib/firebase/admin';

import { listOwnedTrees, recursiveDeleteTree, transferTrees } from './treeAdmin';

const db = () => getAdminDb();

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
    .set({ names: { en: 'A' }, gender: 'male', isLiving: true });
  await db()
    .doc(`trees/${treeId}/relationships/s_p1_p2`)
    .set({ type: 'spouse', personIds: ['p1', 'p2'], status: 'married' });
}

beforeEach(async () => {
  await db().recursiveDelete(db().collection('trees'));
});

afterAll(async () => {
  await db().recursiveDelete(db().collection('trees'));
});

describe('treeAdmin', () => {
  it('lists only the trees a user owns', async () => {
    await seedTree('t1', 'guest');
    await seedTree('t2', 'guest', { other: 'editor' });
    await seedTree('t3', 'other', { guest: 'viewer' });
    const owned = await listOwnedTrees('guest');
    expect(owned.map((t) => t.id).sort()).toEqual(['t1', 't2']);
    expect(owned[0]).toMatchObject({
      ownerId: 'guest',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
  });

  it('moves a guest’s trees to an account, once (DESIGN §9.4)', async () => {
    await seedTree('t1', 'guest');
    await seedTree('t2', 'guest', { other: 'editor' });
    await seedTree('t3', 'other', { guest: 'viewer' });
    expect(await transferTrees('guest', 'user', ['t1', 't2', 't3', 'missing'])).toEqual([
      't1',
      't2',
    ]);
    const t2 = (await db().doc('trees/t2').get()).data()!;
    expect(t2).toMatchObject({
      ownerId: 'user',
      memberIds: ['user', 'other'],
      roles: { user: 'owner', other: 'editor' },
      updatedBy: 'user',
    });
    expect(t2.roles).not.toHaveProperty('guest');
    expect(await transferTrees('guest', 'user', ['t1', 't2'])).toEqual([]);
    expect((await db().doc('trees/t3').get()).data()!.ownerId).toBe('other');
  });

  it('deletes a tree with everything inside it', async () => {
    await seedTree('t1', 'guest');
    await seedTree('t2', 'guest');
    await recursiveDeleteTree('t1');
    expect((await db().doc('trees/t1').get()).exists).toBe(false);
    expect((await db().collection('trees/t1/persons').get()).empty).toBe(true);
    expect((await db().collection('trees/t1/relationships').get()).empty).toBe(true);
    expect((await db().doc('trees/t2/persons/p1').get()).exists).toBe(true);
  });
});
