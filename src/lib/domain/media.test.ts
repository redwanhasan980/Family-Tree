import { describe, expect, it } from 'vitest';

import {
  MediaDeleteRequestSchema,
  MediaSignRequestSchema,
  parsePhotoId,
  photoFolder,
  photoId,
} from './media';
import { PhotoRefSchema } from './schemas';

describe('photo IDs (DESIGN §15.1)', () => {
  it('reads our public IDs back into their parts', () => {
    const id = 'shikor/dev/tree1/person1/AbC_d-123456';
    expect(parsePhotoId(id)).toEqual({
      env: 'dev',
      treeId: 'tree1',
      personId: 'person1',
      suffix: 'AbC_d-123456',
    });
    expect(photoId(parsePhotoId(id)!)).toBe(id);
    // Stored photos must pass the person schema too.
    expect(
      PhotoRefSchema.safeParse({ publicId: id, version: 1, width: 1, height: 1 }).success,
    ).toBe(true);
  });

  it('rejects anything else', () => {
    for (const id of [
      'sample',
      'shikor/dev/tree1/person1',
      'shikor/DEV/tree1/person1/abcdefgh',
      'shikor/dev/tree-1/person1/abcdefgh',
      'shikor/dev/tree1/person1/short',
      'other/dev/tree1/person1/abcdefgh',
      'shikor/dev/tree1/person1/abcdefgh/extra',
    ]) {
      expect(parsePhotoId(id), id).toBeNull();
    }
    expect(() =>
      photoId({ env: 'dev', treeId: 'a/b', personId: 'p', suffix: 'abcdefgh' }),
    ).toThrow();
  });

  it('builds tree and person folders', () => {
    expect(photoFolder('prod', 't1')).toBe('shikor/prod/t1');
    expect(photoFolder('prod', 't1', 'p1')).toBe('shikor/prod/t1/p1');
  });
});

describe('media request schemas', () => {
  it('accepts valid requests and nothing more', () => {
    expect(MediaSignRequestSchema.safeParse({ treeId: 't1', personId: 'p1' }).success).toBe(true);
    expect(MediaSignRequestSchema.safeParse({ treeId: 't1', personId: 'p/1' }).success).toBe(false);
    expect(
      MediaSignRequestSchema.safeParse({ treeId: 't1', personId: 'p1', folder: 'x' }).success,
    ).toBe(false);
    expect(MediaDeleteRequestSchema.safeParse({ treeId: 't1', publicIds: [] }).success).toBe(false);
    expect(
      MediaDeleteRequestSchema.safeParse({ treeId: 't1', publicIds: Array(51).fill('x') }).success,
    ).toBe(false);
  });
});
