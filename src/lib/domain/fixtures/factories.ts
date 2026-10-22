import { parentLinkId, spouseLinkId, spousePair } from '../ids';

import type {
  ID,
  ParentKind,
  ParentLink,
  Person,
  SpouseLink,
  SpouseStatus,
  Stamps,
} from '../types';

/** Builders for tests and generated fixtures. Stamps are fixed so results are repeatable. */

const EPOCH = Date.UTC(2020, 0, 1);

export function stamps(order = 0, by: ID = 'seed'): Stamps {
  const at = new Date(EPOCH + order * 1000);
  return { createdAt: at, createdBy: by, updatedAt: at, updatedBy: by };
}

export function makePerson(id: ID, overrides: Partial<Omit<Person, 'id'>> = {}): Person {
  return {
    id,
    names: { en: id },
    gender: 'unknown',
    isLiving: true,
    ...stamps(),
    schemaVersion: 1,
    ...overrides,
  };
}

export function makeParentLink(
  parentId: ID,
  childId: ID,
  kind: ParentKind = 'biological',
  overrides: Partial<Stamps> = {},
): ParentLink {
  return {
    id: parentLinkId(parentId, childId),
    type: 'parent',
    parentId,
    childId,
    kind,
    ...stamps(),
    ...overrides,
    schemaVersion: 1,
  };
}

export function makeSpouseLink(
  a: ID,
  b: ID,
  overrides: Partial<Pick<SpouseLink, 'marriageDate' | 'sequence'> & Stamps> & {
    status?: SpouseStatus;
  } = {},
): SpouseLink {
  return {
    id: spouseLinkId(a, b),
    type: 'spouse',
    personIds: spousePair(a, b),
    status: 'married',
    ...stamps(),
    ...overrides,
    schemaVersion: 1,
  };
}
