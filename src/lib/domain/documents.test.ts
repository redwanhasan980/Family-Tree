import { describe, expect, it } from 'vitest';

import {
  compact,
  newStamps,
  personDoc,
  personFields,
  personFromDoc,
  relationshipFields,
  relationshipFromDoc,
  restoreStamps,
  treeFromDoc,
  updateStamps,
} from './documents';
import { makeParentLink, makePerson, makeSpouseLink, stamps } from './fixtures/factories';
import { DEFAULT_TREE_SETTINGS } from './schemas';
import { SERVER_TIME } from './writes';

const NOW = new Date('2026-10-22T00:00:00Z');
const AT = new Date('2026-01-01T00:00:00Z');

describe('compact', () => {
  it('drops undefined at every depth and keeps null, dates and arrays', () => {
    expect(
      compact({
        a: 1,
        b: undefined,
        c: { d: undefined, e: null },
        f: [{ g: undefined, h: 2 }],
        t: AT,
      }),
    ).toEqual({
      a: 1,
      c: { e: null },
      f: [{ h: 2 }],
      t: AT,
    });
  });
});

describe('personFromDoc', () => {
  const full = {
    names: { bn: 'আব্দুল করিম', en: 'Abdul Karim' },
    nickname: 'করিম মিয়া',
    gender: 'male',
    isLiving: false,
    birth: { date: { year: 1931, approximate: true }, place: 'শিবগঞ্জ' },
    death: { date: { year: 2004, month: 3, day: 12 } },
    profession: 'কৃষক',
    education: 'Class 8',
    addresses: { present: 'Dhaka', permanent: 'Shibganj' },
    phones: ['+880 1711'],
    email: 'k@example.com',
    description: 'A farmer.',
    photo: { publicId: 'shikor/prod/t/p/x', version: 2, width: 10, height: 20 },
    customFields: [{ id: 'f1', label: 'Blood group', value: 'B+' }],
    childOrder: 1.5,
    createdAt: AT,
    createdBy: 'u1',
    updatedAt: AT,
    updatedBy: 'u2',
    schemaVersion: 1,
  };

  it('reads a complete person', () => {
    const { schemaVersion, ...rest } = full;
    expect(personFromDoc('p1', full, NOW)).toEqual({ id: 'p1', ...rest, schemaVersion });
  });

  it('round-trips through personDoc', () => {
    const person = personFromDoc('p1', full, NOW)!;
    const data = personDoc(person, {
      createdAt: AT,
      createdBy: 'u1',
      updatedAt: AT,
      updatedBy: 'u2',
      schemaVersion: 1,
    });
    expect(personFromDoc('p1', data, NOW)).toEqual(person);
  });

  it('falls back to safe values for broken fields', () => {
    expect(
      personFromDoc(
        'p2',
        {
          names: { en: 7, bn: '' },
          gender: 'other',
          isLiving: 'no',
          birth: { date: { year: 'x' }, place: 5 },
          death: 'yesterday',
          addresses: { present: '' },
          phones: [1, 'ok'],
          photo: { publicId: 'x' },
          customFields: [{ id: 'f' }, { id: 'g', label: 'L', value: 'V' }],
          childOrder: Number.NaN,
          createdAt: 'yesterday',
        },
        NOW,
      ),
    ).toEqual({
      id: 'p2',
      names: {},
      gender: 'unknown',
      isLiving: true,
      phones: ['ok'],
      customFields: [{ id: 'g', label: 'L', value: 'V' }],
      createdAt: NOW,
      createdBy: '',
      updatedAt: NOW,
      updatedBy: '',
      schemaVersion: 1,
    });
    expect(personFromDoc('p3', null, NOW)).toBeNull();
    expect(personFromDoc('p3', [], NOW)).toBeNull();
    expect(
      personFromDoc('p4', { names: {}, photo: null, birth: { date: { year: 1990, day: 3 } } }, NOW),
    ).toMatchObject({
      photo: null,
      birth: { date: { year: 1990 } },
    });
  });
});

describe('relationshipFromDoc', () => {
  it('reads parent and spouse links', () => {
    const parent = makeParentLink('dad', 'kid', 'adoptive', { createdAt: AT, updatedAt: AT });
    const { id, ...parentData } = parent;
    expect(relationshipFromDoc(id, parentData, NOW)).toEqual(parent);

    const spouse = makeSpouseLink('amy', 'zed', {
      marriageDate: { year: 1950 },
      sequence: 2,
      status: 'widowed',
    });
    const { id: sid, ...spouseData } = spouse;
    expect(relationshipFromDoc(sid, spouseData, NOW)).toEqual(spouse);
  });

  it('defaults unknown kinds and statuses, and rejects unusable links', () => {
    expect(
      relationshipFromDoc('p_a_b', { type: 'parent', parentId: 'a', childId: 'b', kind: '?' }, NOW),
    ).toMatchObject({
      kind: 'biological',
    });
    expect(
      relationshipFromDoc('s_a_b', { type: 'spouse', personIds: ['a', 'b'], status: '?' }, NOW),
    ).toMatchObject({
      status: 'married',
    });
    expect(relationshipFromDoc('p_a_b', { type: 'parent', parentId: 'a' }, NOW)).toBeNull();
    expect(relationshipFromDoc('s_a_b', { type: 'spouse', personIds: ['a'] }, NOW)).toBeNull();
    expect(
      relationshipFromDoc('s_a_b', { type: 'spouse', personIds: ['a', 'b', 'c'] }, NOW),
    ).toBeNull();
    expect(
      relationshipFromDoc('x_a_b', { type: 'parent', parentId: 'a', childId: 'b' }, NOW),
    ).toBeNull();
    expect(relationshipFromDoc('p_a_b', 'nope', NOW)).toBeNull();
  });
});

describe('treeFromDoc', () => {
  it('reads a tree, keeping only known roles and filling default settings', () => {
    expect(
      treeFromDoc(
        't1',
        {
          name: 'করিম পরিবার',
          ownerId: 'u1',
          memberIds: ['u1', 'u2', 3],
          roles: { u1: 'owner', u2: 'editor', u3: 'admin' },
          rootPersonId: 'p1',
          personCount: -4,
          settings: { colorBy: 'none', showPhotos: false, kinshipStyle: 'xx' },
          createdAt: AT,
        },
        NOW,
      ),
    ).toEqual({
      id: 't1',
      name: 'করিম পরিবার',
      ownerId: 'u1',
      memberIds: ['u1', 'u2'],
      roles: { u1: 'owner', u2: 'editor' },
      rootPersonId: 'p1',
      personCount: 0,
      settings: { ...DEFAULT_TREE_SETTINGS, colorBy: 'none', showPhotos: false },
      createdAt: AT,
      updatedAt: NOW,
      updatedBy: '',
      schemaVersion: 1,
    });
    expect(treeFromDoc('t2', { name: 'x' }, NOW)).toBeNull();
    expect(treeFromDoc('t3', 42, NOW)).toBeNull();
    expect(treeFromDoc('t4', { ownerId: 'u', roles: [] }, NOW)).toMatchObject({
      name: '',
      roles: {},
      memberIds: [],
      settings: DEFAULT_TREE_SETTINGS,
    });
  });
});

describe('writing', () => {
  it('builds stamps for new, updated and restored documents', () => {
    expect(newStamps('u1')).toEqual({
      createdAt: SERVER_TIME,
      createdBy: 'u1',
      updatedAt: SERVER_TIME,
      updatedBy: 'u1',
      schemaVersion: 1,
    });
    expect(updateStamps('u2')).toEqual({ updatedAt: SERVER_TIME, updatedBy: 'u2' });
    expect(restoreStamps(stamps(3, 'u1'), 'u2')).toEqual({
      createdAt: stamps(3).createdAt,
      createdBy: 'u1',
      updatedAt: SERVER_TIME,
      updatedBy: 'u2',
      schemaVersion: 1,
    });
  });

  it('keeps only stored person fields', () => {
    const person = makePerson('p1', { names: { en: 'Karim' }, nickname: undefined, childOrder: 2 });
    expect(personFields(person)).toEqual({
      names: { en: 'Karim' },
      gender: 'unknown',
      isLiving: true,
      childOrder: 2,
    });
  });

  it('keeps only stored relationship fields', () => {
    expect(relationshipFields(makeParentLink('a', 'b', 'step'))).toEqual({
      type: 'parent',
      parentId: 'a',
      childId: 'b',
      kind: 'step',
    });
    expect(relationshipFields(makeSpouseLink('b', 'a', { sequence: 1 }))).toEqual({
      type: 'spouse',
      personIds: ['a', 'b'],
      status: 'married',
      sequence: 1,
    });
  });
});
