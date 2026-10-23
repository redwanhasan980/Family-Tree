import { afterAll, afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { parsePhotoId } from '@/lib/domain/media';
import { DEFAULT_TREE_SETTINGS } from '@/lib/domain/schemas';
import { getAdminDb } from '@/lib/firebase/admin';
import { signParams } from '@/lib/server/cloudinary';
import {
  apiRequest,
  clearAuthEmulator,
  createEmailUser,
  createGuestUser,
  type TestUser,
} from '@/lib/server/testing/authEmulator';
import { recursiveDeleteTree } from '@/lib/server/treeAdmin';

import { POST as remove } from './delete/route';
import { POST as sign } from './sign/route';

/**
 * P5-03, P5-07: the photo endpoints with real emulator sign-ins and Firestore, and
 * Cloudinary's HTTP API intercepted.
 */

const db = () => getAdminDb();
const SECRET = 'test-secret';
const OLD = 'shikor/test/t1/p1/oldPhoto1234';
const CURRENT = 'shikor/test/t1/p1/currentPhoto12';

async function seedTree(treeId: string, roles: Record<string, string>, photo?: string) {
  await db()
    .doc(`trees/${treeId}`)
    .set({
      name: treeId,
      ownerId: Object.keys(roles).find((uid) => roles[uid] === 'owner'),
      memberIds: Object.keys(roles),
      roles,
      personCount: 1,
      settings: DEFAULT_TREE_SETTINGS,
      createdAt: new Date(),
      updatedAt: new Date(),
      updatedBy: 'seed',
      schemaVersion: 1,
    });
  await db()
    .doc(`trees/${treeId}/persons/p1`)
    .set({
      names: { en: 'A' },
      gender: 'male',
      ...(photo && { photo: { publicId: photo, version: 1, width: 10, height: 10 } }),
    });
}

async function call(
  handler: (request: Request, context: unknown) => Promise<Response>,
  path: string,
  body: unknown,
  user?: TestUser,
) {
  const response = await handler(apiRequest(path, { user, body }), {});
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

let cloudinary: Mock<(url: string, init?: RequestInit) => Response>;

beforeEach(async () => {
  vi.stubEnv('NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME', 'test-cloud');
  vi.stubEnv('CLOUDINARY_API_KEY', 'test-key');
  vi.stubEnv('CLOUDINARY_API_SECRET', SECRET);
  vi.stubEnv('APP_ENV', 'test');
  // Cloudinary answers "deleted" for every ID; other requests (the emulators) go through.
  cloudinary = vi.fn((url: string, _init?: RequestInit) => {
    const ids = new URL(url).searchParams.getAll('public_ids[]');
    return Response.json({ deleted: Object.fromEntries(ids.map((id) => [id, 'deleted'])) });
  });
  const realFetch = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    return url.startsWith('https://api.cloudinary.com/')
      ? Promise.resolve(cloudinary(url, init))
      : realFetch(input, init);
  });
  await db().recursiveDelete(db().collection('trees'));
  await db().recursiveDelete(db().collection('rateLimits'));
  await clearAuthEmulator();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await db().recursiveDelete(db().collection('trees'));
  await db().recursiveDelete(db().collection('rateLimits'));
  await clearAuthEmulator();
});

describe('POST /api/media/sign (MED-07)', () => {
  it('signs an upload for an owner or editor, guests included', async () => {
    const guest = await createGuestUser();
    const editor = await createEmailUser(`editor-${Date.now()}@example.com`);
    await seedTree('t1', { [guest.uid]: 'owner', [editor.uid]: 'editor' });

    for (const user of [guest, editor]) {
      const { status, body } = await call(
        sign,
        '/api/media/sign',
        { treeId: 't1', personId: 'p1' },
        user,
      );
      expect(status).toBe(200);
      expect(parsePhotoId(body.publicId as string)).toMatchObject({
        env: 'test',
        treeId: 't1',
        personId: 'p1',
      });
      expect(body).toMatchObject({
        uploadUrl: 'https://api.cloudinary.com/v1_1/test-cloud/image/upload',
        apiKey: 'test-key',
        assetFolder: 'shikor/test/t1/p1',
        transformation: 'c_limit,w_2000,h_2000',
      });
      // The signature covers exactly the parameters the browser sends.
      expect(body.signature).toBe(
        signParams(
          {
            allowed_formats: body.allowedFormats as string,
            asset_folder: body.assetFolder as string,
            public_id: body.publicId as string,
            timestamp: body.timestamp as number,
            transformation: body.transformation as string,
          },
          SECRET,
        ),
      );
      expect(JSON.stringify(body)).not.toContain(SECRET);
    }
  });

  it('refuses viewers, outsiders, missing people and bad requests', async () => {
    const owner = await createEmailUser(`owner-${Date.now()}@example.com`);
    const viewer = await createEmailUser(`viewer-${Date.now()}@example.com`);
    const outsider = await createGuestUser();
    await seedTree('t1', { [owner.uid]: 'owner', [viewer.uid]: 'viewer' });
    const request = { treeId: 't1', personId: 'p1' };

    expect(await call(sign, '/api/media/sign', request, viewer)).toMatchObject({
      status: 403,
      body: { error: { code: 'forbidden' } },
    });
    expect((await call(sign, '/api/media/sign', request, outsider)).status).toBe(404);
    expect(
      (await call(sign, '/api/media/sign', { treeId: 't1', personId: 'nobody' }, owner)).status,
    ).toBe(404);
    expect((await call(sign, '/api/media/sign', { treeId: 't1' }, owner)).status).toBe(400);
    expect(
      (await call(sign, '/api/media/sign', { ...request, publicId: 'mine' }, owner)).status,
    ).toBe(400);
    expect((await call(sign, '/api/media/sign', request)).status).toBe(401);
  });

  it('limits signatures to 60 an hour per user', async () => {
    const owner = await createGuestUser();
    await seedTree('t1', { [owner.uid]: 'owner' });
    const hour = Date.now() - (Date.now() % 3_600_000);
    await db().doc(`rateLimits/mediaSign:${owner.uid}:${hour}`).set({ uid: owner.uid, count: 60 });
    expect(
      await call(sign, '/api/media/sign', { treeId: 't1', personId: 'p1' }, owner),
    ).toMatchObject({ status: 429, body: { error: { code: 'rate_limited' } } });
  });

  it('says photos are unavailable on a server without Cloudinary keys', async () => {
    vi.stubEnv('CLOUDINARY_API_SECRET', '');
    const owner = await createGuestUser();
    await seedTree('t1', { [owner.uid]: 'owner' });
    expect(
      await call(sign, '/api/media/sign', { treeId: 't1', personId: 'p1' }, owner),
    ).toMatchObject({ status: 503, body: { error: { code: 'unavailable' } } });
  });
});

describe('POST /api/media/delete (MED-05)', () => {
  it('deletes replaced photos but keeps one that is still in use', async () => {
    const owner = await createGuestUser();
    await seedTree('t1', { [owner.uid]: 'owner' }, CURRENT);
    const { status, body } = await call(
      remove,
      '/api/media/delete',
      { treeId: 't1', publicIds: [OLD, CURRENT, OLD] },
      owner,
    );
    expect(status).toBe(200);
    expect(body).toEqual({ deleted: [OLD], inUse: [CURRENT] });
    expect(cloudinary).toHaveBeenCalledTimes(1);
    const [url, init] = cloudinary.mock.calls[0]!;
    expect(new URL(url).searchParams.getAll('public_ids[]')).toEqual([OLD]);
    expect(init?.method).toBe('DELETE');
  });

  it('refuses photos of another tree or environment, and viewers', async () => {
    const owner = await createEmailUser(`owner-${Date.now()}@example.com`);
    const viewer = await createEmailUser(`viewer-${Date.now()}@example.com`);
    await seedTree('t1', { [owner.uid]: 'owner', [viewer.uid]: 'viewer' });
    for (const id of [
      'shikor/test/t2/p1/otherTree123',
      'shikor/prod/t1/p1/otherEnv1234',
      'sample',
    ]) {
      expect(
        (await call(remove, '/api/media/delete', { treeId: 't1', publicIds: [id] }, owner)).status,
      ).toBe(400);
    }
    expect(
      (await call(remove, '/api/media/delete', { treeId: 't1', publicIds: [OLD] }, viewer)).status,
    ).toBe(403);
    expect(cloudinary).not.toHaveBeenCalled();
  });
});

describe('deleting a tree (MED-07)', () => {
  it("removes the tree's photos by prefix", async () => {
    const owner = await createGuestUser();
    await seedTree('t1', { [owner.uid]: 'owner' }, CURRENT);
    cloudinary.mockImplementation(() => Response.json({ deleted: {}, partial: false }));
    await recursiveDeleteTree('t1');
    expect(cloudinary).toHaveBeenCalledTimes(1);
    expect(new URL(cloudinary.mock.calls[0]![0]).searchParams.get('prefix')).toBe(
      'shikor/test/t1/',
    );
  });

  it('still deletes the data when Cloudinary fails', async () => {
    const owner = await createGuestUser();
    await seedTree('t1', { [owner.uid]: 'owner' });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    cloudinary.mockImplementation(() => new Response('down', { status: 500 }));
    await recursiveDeleteTree('t1');
    expect((await db().doc('trees/t1').get()).exists).toBe(false);
  });
});
