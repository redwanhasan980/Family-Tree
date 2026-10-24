import { describe, expect, it } from 'vitest';

import { BACKUP_FORMAT, buildBackup, parseBackup, type BackupInput } from './backup';
import { makeParentLink, makePerson, makeSpouseLink } from './fixtures/factories';
import { testFamily } from './fixtures/testFamily';
import { DEFAULT_TREE_SETTINGS } from './schemas';

import type { Tree } from './types';

const tree: Tree = {
  id: 't1',
  name: 'করিম পরিবার',
  description: 'বাবার দিক',
  ownerId: 'u1',
  memberIds: ['u1'],
  roles: { u1: 'owner' },
  rootPersonId: 'G',
  personCount: 16,
  settings: DEFAULT_TREE_SETTINGS,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-02T00:00:00Z'),
  updatedBy: 'u1',
  schemaVersion: 1,
};

const input = (overrides: Partial<BackupInput> = {}): BackupInput => {
  const { persons, relationships } = testFamily();
  return {
    tree,
    persons,
    relationships,
    exportedAt: new Date('2026-10-24T10:00:00Z'),
    app: { name: 'শিকড়', version: '0.1.0' },
    ...overrides,
  };
};

describe('buildBackup (BAK-01)', () => {
  it('holds the tree, everyone and every relationship, in a stable order', () => {
    const backup = buildBackup(input());
    expect(backup).toMatchObject({
      format: BACKUP_FORMAT,
      version: 1,
      exportedAt: '2026-10-24T10:00:00.000Z',
      tree: { name: 'করিম পরিবার', description: 'বাবার দিক', rootPersonId: 'G' },
    });
    expect(backup.persons).toHaveLength(16);
    expect(backup.persons.map((p) => p.id)).toEqual([...backup.persons.map((p) => p.id)].sort());
    expect(backup.relationships.length).toBeGreaterThan(20);
    // The same tree gives the same file.
    const shuffled = input({ persons: [...testFamily().persons].reverse() });
    expect(JSON.stringify(buildBackup(shuffled))).toBe(JSON.stringify(backup));
  });

  it('leaves out user IDs and roles, and keeps photo references with a link', () => {
    const photo = { publicId: 'shikor/dev/t1/a/x1', version: 3, width: 800, height: 800 };
    const backup = buildBackup(
      input({
        persons: [makePerson('a', { photo, nickname: 'রাজু' }), makePerson('b')],
        relationships: [makeSpouseLink('a', 'b', { sequence: 1 }), makeParentLink('a', 'b')],
        photoUrl: (p) => `https://res.cloudinary.com/demo/image/upload/v${p.version}/${p.publicId}`,
      }),
    );
    const text = JSON.stringify(backup);
    expect(text).not.toContain('createdBy');
    expect(text).not.toContain('ownerId');
    expect(text).not.toContain('schemaVersion');
    expect(backup.persons[0]).toMatchObject({
      nickname: 'রাজু',
      photo: { ...photo, url: expect.stringContaining('/v3/shikor/dev/t1/a/x1') },
    });
    expect(backup.persons[1]).not.toHaveProperty('photo');
    expect(backup.relationships.map((r) => r.type)).toEqual(['parent', 'spouse']);
    expect(backup.relationships[1]).toMatchObject({ sequence: 1, status: 'married' });
  });

  it('leaves out what a tree doesn’t have', () => {
    const plain: Tree = { ...tree, description: undefined, rootPersonId: undefined };
    const backup = buildBackup(input({ tree: plain, persons: [], relationships: [] }));
    expect(backup.tree).toEqual({ name: tree.name, settings: tree.settings });
  });
});

describe('parseBackup (BAK-02)', () => {
  it('reads back what it wrote', () => {
    const backup = buildBackup(input());
    expect(parseBackup(JSON.stringify(backup))).toEqual(backup);
  });

  it('refuses other files and broken relationships', () => {
    expect(parseBackup('not json')).toBeNull();
    expect(parseBackup(JSON.stringify({ format: 'other' }))).toBeNull();
    const backup = buildBackup(input());
    const dangling = {
      ...backup,
      relationships: [
        { id: 'p_G_nobody', type: 'parent', parentId: 'G', childId: 'nobody', kind: 'biological' },
      ],
    };
    expect(parseBackup(JSON.stringify(dangling))).toBeNull();
    const misnamed = {
      ...backup,
      relationships: [
        { id: 'p_x_y', type: 'parent', parentId: 'G', childId: 'S1', kind: 'biological' },
      ],
    };
    expect(parseBackup(JSON.stringify(misnamed))).toBeNull();
  });
});
