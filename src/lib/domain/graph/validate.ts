import { ageAt, partialDateKey, today } from '../dates';
import { normalizeSearchText } from '../search';
import { ancestorIds } from './ancestors';
import { parentLinksOf, spouseLinksOf, type FamilyGraph } from './build';
import { childrenOf, parentsOf, siblingsOf } from './families';

import type { ID, Issue, LocalizedName, ParentKind } from '../types';

/**
 * Relationship validation (REL-10, DESIGN §12.5). Security rules can't check the graph,
 * so every command runs these first. Errors block; warnings ask the user to confirm.
 */

const error = (code: string, params?: Issue['params']): Issue => ({
  severity: 'error',
  code,
  ...(params && { params }),
});
const warning = (code: string, params?: Issue['params']): Issue => ({
  severity: 'warning',
  code,
  ...(params && { params }),
});

export function hasErrors(issues: readonly Issue[]): boolean {
  return issues.some((i) => i.severity === 'error');
}

/** True when `ancestorId` is a parent, grandparent … of `personId`. */
export function isAncestor(g: FamilyGraph, ancestorId: ID, personId: ID): boolean {
  return ancestorIds(g, personId).has(ancestorId);
}

/** Making `parentId` a parent of `childId` would make someone their own ancestor. */
export function wouldCreateCycle(g: FamilyGraph, parentId: ID, childId: ID): boolean {
  return parentId === childId || isAncestor(g, childId, parentId);
}

/** Parent born after the child, or fewer than 12 years before (warnings only). */
export function dateWarnings(g: FamilyGraph, parentId: ID, childId: ID): Issue[] {
  const parentYear = g.persons.get(parentId)?.birth?.date?.year;
  const childYear = g.persons.get(childId)?.birth?.date?.year;
  if (parentYear === undefined || childYear === undefined) return [];
  const gap = childYear - parentYear;
  if (gap < 0) return [warning('parentBornAfterChild')];
  if (gap < 12) return [warning('parentTooYoung', { years: gap })];
  return [];
}

/** Older than this and still marked living is probably a mistake. */
export const LIVING_AGE_LIMIT = 120;

/**
 * Unlikely dates around one person, for their details (P5-02): a death before the
 * birth, a "living" person over 120, and parents born after or less than 12 years
 * before them, or children born before or soon after them. Warnings about relatives
 * carry `personId` and `relation` ("parent" or "child").
 */
export function personDateWarnings(g: FamilyGraph, personId: ID, now: Date = new Date()): Issue[] {
  const person = g.persons.get(personId);
  if (!person) return [];
  const issues: Issue[] = [];
  const born = person.birth?.date;
  const died = person.death?.date;
  if (born && died && !person.isLiving && partialDateKey(died) < partialDateKey(born)) {
    issues.push(warning('diedBeforeBorn'));
  }
  const age = born && person.isLiving ? ageAt(born, today(now)) : null;
  if (age && age.years > LIVING_AGE_LIMIT)
    issues.push(warning('livingTooOld', { years: age.years }));
  for (const link of parentLinksOf(g, personId)) {
    for (const issue of dateWarnings(g, link.parentId, personId)) {
      issues.push({
        ...issue,
        params: { ...issue.params, personId: link.parentId, relation: 'parent' },
      });
    }
  }
  for (const childId of childrenOf(g, personId)) {
    for (const issue of dateWarnings(g, personId, childId)) {
      issues.push({ ...issue, params: { ...issue.params, personId: childId, relation: 'child' } });
    }
  }
  return issues;
}

export interface ParentLinkCheck {
  parentId: ID;
  childId: ID;
  kind: ParentKind;
  /** A parent this link replaces (changing the mother or father); ignored by the checks. */
  replacing?: ID;
}

/** Checks a new (or changed) parent → child link. */
export function validateParentLink(
  g: FamilyGraph,
  { parentId, childId, kind, replacing }: ParentLinkCheck,
): Issue[] {
  const parent = g.persons.get(parentId);
  if (!parent || !g.persons.has(childId)) return [error('missingPerson')];
  if (parentId === childId) return [error('selfRelationship')];
  const existing = parentLinksOf(g, childId).filter((l) => l.parentId !== replacing);
  if (existing.some((l) => l.parentId === parentId)) return [error('alreadyParent')];
  if (isAncestor(g, childId, parentId)) return [error('cycle')];
  if (spouseLinksOf(g, parentId).some((l) => l.personIds.includes(childId))) {
    return [error('spouseParentConflict')];
  }
  if (kind === 'biological') {
    const biological = existing.filter((l) => l.kind === 'biological');
    const sameGender =
      parent.gender !== 'unknown' &&
      biological.some((l) => g.persons.get(l.parentId)?.gender === parent.gender);
    if (biological.length >= 2 || sameGender) {
      return [error('tooManyBiologicalParents', { gender: parent.gender })];
    }
  }
  return dateWarnings(g, parentId, childId);
}

/** Checks a new spouse link between `a` and `b`. */
export function validateSpouseLink(g: FamilyGraph, a: ID, b: ID): Issue[] {
  if (!g.persons.has(a) || !g.persons.has(b)) return [error('missingPerson')];
  if (a === b) return [error('selfRelationship')];
  if (spouseLinksOf(g, a).some((l) => l.personIds.includes(b))) return [error('alreadySpouses')];
  const parentChild =
    parentLinksOf(g, a).some((l) => l.parentId === b) ||
    parentLinksOf(g, b).some((l) => l.parentId === a);
  return parentChild ? [error('spouseParentConflict')] : [];
}

/** Parents, siblings and children: where a duplicate entry is most likely (PER-07). */
export function closeRelatives(g: FamilyGraph, personId: ID): ID[] {
  return [
    ...new Set([...parentsOf(g, personId), ...siblingsOf(g, personId), ...childrenOf(g, personId)]),
  ];
}

/** People among `nearIds` whose English or Bangla name matches `names` (PER-07). */
export function findDuplicates(g: FamilyGraph, names: LocalizedName, nearIds: Iterable<ID>): ID[] {
  const wanted = new Set(
    [names.en, names.bn].map((n) => normalizeSearchText(n ?? '')).filter((n) => n.length > 0),
  );
  if (wanted.size === 0) return [];
  const result: ID[] = [];
  for (const id of nearIds) {
    const person = g.persons.get(id);
    if (!person) continue;
    const theirs = [person.names.en, person.names.bn].map((n) => normalizeSearchText(n ?? ''));
    if (theirs.some((n) => wanted.has(n))) result.push(id);
  }
  return result;
}
