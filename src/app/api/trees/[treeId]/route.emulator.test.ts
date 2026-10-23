import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_TREE_SETTINGS } from '@/lib/domain/schemas';
import { getAdminDb } from '@/lib/firebase/admin';
import {
  apiRequest,
  clearAuthEmulator,
  createEmailUser,
  createGuestUser,
  type TestUser,
} from '@/lib/server/testing/authEmulator';

import { DELETE } from './route';

const db = () => getAdminDb();

async function seedTree(treeId: string, ownerId: string, members: Record<string, string> = {}) {
  const roles = { [ownerId]: 'owner', ...members };
  await db()
    .doc(`trees/${treeId}`)
    .set({
      name: treeId,
      ownerId,
      memberIds: Object.keys(roles),
      roles,
      personCount: 1,
      settings: DEFAULT_TREE_SETTINGS,
      createdAt: new Date(),
      updatedAt: new Date(),
      updatedBy: ownerId,
      schemaVersion: 1,
    });
  await db()
    .doc(`trees/${treeId}/persons/p1`)
    .set({ names: { en: 'A' }, gender: 'male' });
  await db()
    .doc(`trees/${treeId}/relationships/p_p1_p2`)
    .set({ type: 'parent', parentId: 'p1', childId: 'p2' });
}

async function remove(treeId: string, user?: TestUser) {
  const response = await DELETE(apiRequest(`/api/trees/${treeId}`, { user, method: 'DELETE' }), {
    params: Promise.resolve({ treeId }),
  });
  return { status: response.status, body: (await response.json()) as unknown };
}

const exists = async (path: string) => (await db().doc(path).get()).exists;

beforeEach(async () => {
  await db().recursiveDelete(db().collection('trees'));
  await clearAuthEmulator();
});

afterAll(async () => {
  await db().recursiveDelete(db().collection('trees'));
  await clearAuthEmulator();
});

describe('DELETE /api/trees/[treeId] (TREE-03)', () => {
  it('lets the owner, guest or not, delete a tree with everything in it', async () => {
    const guest = await createGuestUser();
    await seedTree('t', guest.uid);
    expect(await remove('t', guest)).toEqual({ status: 200, body: { ok: true } });
    expect(await exists('trees/t')).toBe(false);
    expect(await exists('trees/t/persons/p1')).toBe(false);
    expect(await exists('trees/t/relationships/p_p1_p2')).toBe(false);
  });

  it('refuses editors, outsiders and bad IDs', async () => {
    const owner = await createEmailUser(`owner-${Date.now()}@example.com`);
    const editor = await createEmailUser(`editor-${Date.now()}@example.com`);
    const outsider = await createGuestUser();
    await seedTree('t', owner.uid, { [editor.uid]: 'editor' });

    expect(await remove('t', editor)).toMatchObject({
      status: 403,
      body: { error: { code: 'forbidden' } },
    });
    expect(await remove('t', outsider)).toMatchObject({
      status: 404,
      body: { error: { code: 'not_found' } },
    });
    expect((await remove('missing', owner)).status).toBe(404);
    expect((await remove('bad.id', owner)).status).toBe(400);
    expect((await remove('t')).status).toBe(401);
    expect(await exists('trees/t')).toBe(true);
  });
});
