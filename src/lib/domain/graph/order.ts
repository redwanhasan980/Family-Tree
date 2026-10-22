import { comparePartialDates } from '../dates';
import { compareNames } from '../names';

import type { Gender, ID, ParentKind, ParentLink, Person, SpouseLink } from '../types';

/** Ordering rules shared by every view (DESIGN §12.2). All are total and deterministic. */

const KIND_ORDER: Record<ParentKind, number> = { biological: 0, adoptive: 1, foster: 2, step: 3 };
const GENDER_ORDER: Record<Gender, number> = { male: 0, female: 1, unknown: 2 };

function sortName(p: Person): string {
  return p.names.en || p.names.bn || '';
}

/** Birth date, then creation time, then name, then ID. */
function compareByFacts(a: Person, b: Person): number {
  return (
    comparePartialDates(a.birth?.date, b.birth?.date) ||
    a.createdAt.getTime() - b.createdAt.getTime() ||
    compareNames(sortName(a), sortName(b), 'en') ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/**
 * Each sibling's effective order key (DESIGN §12.2). Siblings are first ranked by birth
 * date, creation time and name; that rank is the key unless the person has an explicit
 * `childOrder` (set when the user reorders children or adds several in a given order).
 * Both live in the same number space, so children added later with `childOrder = max + 1`
 * go after older siblings that never had one.
 */
export function siblingKeys(children: readonly Person[]): Map<ID, number> {
  const byFacts = [...children].sort(compareByFacts);
  return new Map(byFacts.map((p, index) => [p.id, p.childOrder ?? index]));
}

/** Siblings in display order. Equal keys keep the birth-date order. */
export function sortSiblings(children: readonly Person[]): Person[] {
  const byFacts = [...children].sort(compareByFacts);
  const rank = new Map(byFacts.map((p, index) => [p.id, index]));
  const key = (p: Person) => p.childOrder ?? rank.get(p.id)!;
  return byFacts.sort((a, b) => key(a) - key(b) || rank.get(a.id)! - rank.get(b.id)!);
}

/** The key for a child added after all current siblings. */
export function nextSiblingKey(children: readonly Person[]): number {
  let max = -1;
  for (const key of siblingKeys(children).values()) max = Math.max(max, key);
  return Math.floor(max) + 1;
}

/** Parents: biological first, then father before mother, then by ID. */
export function compareParentLinks(
  a: ParentLink,
  b: ParentLink,
  persons: ReadonlyMap<ID, Person>,
): number {
  const ga = persons.get(a.parentId)?.gender ?? 'unknown';
  const gb = persons.get(b.parentId)?.gender ?? 'unknown';
  return (
    KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
    GENDER_ORDER[ga] - GENDER_ORDER[gb] ||
    (a.parentId < b.parentId ? -1 : a.parentId > b.parentId ? 1 : 0)
  );
}

/** Marriages: by sequence (first marriage first), then marriage date, then when recorded. */
export function compareSpouseLinks(a: SpouseLink, b: SpouseLink): number {
  if (a.sequence !== undefined && b.sequence !== undefined && a.sequence !== b.sequence) {
    return a.sequence - b.sequence;
  }
  if ((a.sequence === undefined) !== (b.sequence === undefined))
    return a.sequence === undefined ? 1 : -1;
  return (
    comparePartialDates(a.marriageDate, b.marriageDate) ||
    a.createdAt.getTime() - b.createdAt.getTime() ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

export function parentKindRank(kind: ParentKind): number {
  return KIND_ORDER[kind];
}
