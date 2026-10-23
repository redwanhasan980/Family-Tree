import { comparePartialDates } from '@/lib/domain/dates';
import {
  branchOf,
  buildDescendantTree,
  computeGenerations,
  walkDescendants,
  type FamilyGraph,
} from '@/lib/domain/graph';
import { compareNames, displayName, type ShownName } from '@/lib/domain/names';
import { searchPersons } from '@/lib/domain/search';
import type { ID, Locale, NameDisplay, Person } from '@/lib/domain/types';

/** Directory mode (LV-04, DESIGN §13.5): everyone in the tree as one flat list. */
export interface DirectoryEntry {
  person: Person;
  name: ShownName;
  /** 1 = the person the tree starts from; null for people it doesn't reach. */
  generation: number | null;
  /** Which of the start's children the person descends from (or married into). */
  branch: number | null;
}

export type DirectorySort = 'name' | 'birth' | 'generation';
export type SortDirection = 'asc' | 'desc';

export interface DirectoryFilters {
  query: string;
  status: 'all' | 'living' | 'deceased';
  gender: 'all' | 'male' | 'female';
  generation: number | null;
  branch: number | null;
}

export const NO_FILTERS: DirectoryFilters = {
  query: '',
  status: 'all',
  gender: 'all',
  generation: null,
  branch: null,
};

/** How many filters other than the name search are on. */
export function activeFilters(filters: DirectoryFilters): number {
  return (
    Number(filters.status !== 'all') +
    Number(filters.gender !== 'all') +
    Number(filters.generation !== null) +
    Number(filters.branch !== null)
  );
}

/**
 * Branch index by person, from the start's children in order: descendants take the
 * branch where they first appear, husbands and wives the branch of their partner.
 */
export function branchesOf(g: FamilyGraph, start: ID | null): Map<ID, number> {
  const branches = new Map<ID, number>();
  const root = start ? buildDescendantTree(g, start) : null;
  if (!root) return branches;
  const byKey = branchOf(root);
  walkDescendants(root, (node) => {
    const branch = byKey.get(node.key);
    if (branch === null || branch === undefined || node.isRef) return;
    if (!branches.has(node.personId)) branches.set(node.personId, branch);
    for (const partner of node.partners) {
      if (!branches.has(partner.personId)) branches.set(partner.personId, branch);
    }
  });
  return branches;
}

/** The people who head each branch: the start's children, in the tree's order. */
export function branchHeads(g: FamilyGraph, start: ID | null): ID[] {
  const root = start ? buildDescendantTree(g, start, { maxDepth: 1 }) : null;
  return root ? root.children.map((child) => child.personId) : [];
}

export function directoryEntries(
  g: FamilyGraph,
  start: ID | null,
  nameDisplay: NameDisplay,
  locale: Locale,
): DirectoryEntry[] {
  const generations = start ? computeGenerations(g, start) : new Map<ID, number>();
  const branches = branchesOf(g, start);
  return [...g.persons.values()].map((person) => ({
    person,
    name: displayName(person.names, nameDisplay, locale),
    generation: generations.get(person.id) ?? null,
    branch: branches.get(person.id) ?? null,
  }));
}

/** The entries the filters let through; a name search keeps the best matches first. */
export function filterDirectory(
  entries: readonly DirectoryEntry[],
  filters: DirectoryFilters,
): DirectoryEntry[] {
  const kept = entries.filter(
    ({ person, generation, branch }) =>
      (filters.status === 'all' || person.isLiving === (filters.status === 'living')) &&
      (filters.gender === 'all' || person.gender === filters.gender) &&
      (filters.generation === null || generation === filters.generation) &&
      (filters.branch === null || branch === filters.branch),
  );
  if (!filters.query.trim()) return kept;
  const byId = new Map(kept.map((entry) => [entry.person.id, entry]));
  return searchPersons(
    kept.map((entry) => entry.person),
    filters.query,
    kept.length,
  ).map((hit) => byId.get(hit.personId)!);
}

/**
 * Unknown values go last whichever way the list is sorted; null means both are known
 * (or both unknown), so the caller compares further.
 */
function lastIfUnknown<T>(a: T | null, b: T | null): number | null {
  if ((a === null) === (b === null)) return null;
  return a === null ? 1 : -1;
}

export function sortDirectory(
  entries: readonly DirectoryEntry[],
  sort: DirectorySort,
  direction: SortDirection,
  locale: Locale,
): DirectoryEntry[] {
  const sign = direction === 'asc' ? 1 : -1;
  const byName = (a: DirectoryEntry, b: DirectoryEntry) =>
    compareNames(a.name.text, b.name.text, locale) ||
    (a.person.id < b.person.id ? -1 : a.person.id > b.person.id ? 1 : 0);
  const compare = (a: DirectoryEntry, b: DirectoryEntry): number => {
    switch (sort) {
      case 'name':
        return sign * byName(a, b);
      case 'birth': {
        const da = a.person.birth?.date ?? null;
        const db = b.person.birth?.date ?? null;
        return (
          lastIfUnknown(da, db) ??
          (sign * comparePartialDates(da ?? undefined, db ?? undefined) || byName(a, b))
        );
      }
      case 'generation':
        return (
          lastIfUnknown(a.generation, b.generation) ??
          (sign * ((a.generation ?? 0) - (b.generation ?? 0)) || byName(a, b))
        );
      default:
        sort satisfies never;
        return 0;
    }
  };
  return [...entries].sort(compare);
}
