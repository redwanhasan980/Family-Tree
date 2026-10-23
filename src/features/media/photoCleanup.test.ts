import { afterEach, describe, expect, it, vi } from 'vitest';

import { DELETE_FIELD, type WriteOp } from '@/lib/domain/writes';
import { ApiError } from '@/lib/repositories/api';
import type * as ApiModule from '@/lib/repositories/api';

import {
  flushPhotoDeletions,
  pendingPhotoDeletions,
  photoIdsIn,
  queuePhotoDeletion,
  removedPhotos,
} from './photoCleanup';

const api = vi.hoisted(() => ({ callApi: vi.fn() }));
vi.mock('@/lib/repositories/api', async (original) => ({
  ...(await original<typeof ApiModule>()),
  callApi: api.callApi,
}));

const A = 'shikor/test/t1/p1/photoAaaaaaa';
const B = 'shikor/test/t1/p2/photoBbbbbbb';
const C = 'shikor/test/t2/p9/photoCccccccc';
const photo = (publicId: string) => ({ publicId, version: 1, width: 1, height: 1 });

afterEach(() => {
  window.localStorage.clear();
  api.callApi.mockReset();
  vi.restoreAllMocks();
});

describe('which photos a change removes (P5-06)', () => {
  it('finds photos in sets and updates, not in deletes or field removals', () => {
    const ops: WriteOp[] = [
      { op: 'update', path: 'trees/t1/persons/p1', data: { photo: photo(A) } },
      { op: 'set', path: 'trees/t1/persons/p2', data: { names: {}, photo: photo(B) } },
      { op: 'update', path: 'trees/t1/persons/p3', data: { photo: DELETE_FIELD } },
      { op: 'delete', path: 'trees/t1/persons/p4' },
    ];
    expect([...photoIdsIn(ops)]).toEqual([A, B]);
  });

  it('reports photos a replacement, removal or deletion takes away', () => {
    const before: WriteOp[] = [{ op: 'update', path: 'x', data: { photo: photo(A) } }];
    const replaced: WriteOp[] = [{ op: 'update', path: 'x', data: { photo: photo(B) } }];
    const removed: WriteOp[] = [{ op: 'update', path: 'x', data: { photo: DELETE_FIELD } }];
    const deleted: WriteOp[] = [{ op: 'delete', path: 'x' }];
    expect(removedPhotos(before, replaced)).toEqual([A]);
    expect(removedPhotos(before, removed)).toEqual([A]);
    expect(removedPhotos(before, deleted)).toEqual([A]);
    // Adding a photo removes nothing.
    expect(removedPhotos(removed, before)).toEqual([]);
  });
});

describe('the deletion queue (MED-05)', () => {
  it('keeps photos something still needs, and deletes the rest tree by tree', async () => {
    queuePhotoDeletion([A, B, C, A, 'not-ours']);
    expect(pendingPhotoDeletions()).toEqual([A, B, C]);
    api.callApi.mockResolvedValue({ deleted: [], inUse: [] });

    await flushPhotoDeletions((id) => id === B);
    expect(api.callApi.mock.calls).toEqual([
      ['/api/media/delete', { body: { treeId: 't1', publicIds: [A] } }],
      ['/api/media/delete', { body: { treeId: 't2', publicIds: [C] } }],
    ]);
    expect(pendingPhotoDeletions()).toEqual([B]);
  });

  it('retries after a network failure, and gives up on a refusal', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    queuePhotoDeletion([A, C]);
    api.callApi
      .mockRejectedValueOnce(new ApiError('network', 0))
      .mockRejectedValueOnce(new ApiError('forbidden', 403));
    await flushPhotoDeletions(() => false);
    expect(pendingPhotoDeletions()).toEqual([A]);
  });

  it('survives blocked storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => queuePhotoDeletion([A])).not.toThrow();
    expect(pendingPhotoDeletions()).toEqual([]);
  });
});
