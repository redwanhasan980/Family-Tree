import {
  buildDescendantTree,
  parentsOf,
  reachableFrom,
  type FamilyGraph,
} from '@/lib/domain/graph';
import type { ID } from '@/lib/domain/types';

import { initialCollapsed, keysToReveal } from './collapse';

/** The tree's start: its root, or the oldest-added person without parents. */
export function startingPerson(g: FamilyGraph, rootId: ID | undefined): ID | null {
  if (rootId && g.persons.has(rootId)) return rootId;
  const people = [...g.persons.values()].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
  return (people.find((p) => parentsOf(g, p.id).length === 0) ?? people[0])?.id ?? null;
}

/** How a descendant view shows someone found by search (VIS-04). */
export interface RevealPlan {
  /** The person the view should start from. */
  from: ID;
  /** The view's new collapsed keys, or null when they can stay. */
  collapsed: string[] | null;
}

/**
 * Keeps the current start when it reaches the person, else goes back to the tree's start,
 * else starts from the person (someone not yet in the tree); then opens the collapsed
 * branches on the way. `saved` is the view's collapsed state, if it has one.
 */
export function planReveal(
  g: FamilyGraph,
  personId: ID,
  focusId: ID | null,
  start: ID | null,
  saved: readonly string[] | undefined,
): RevealPlan | null {
  if (!g.persons.has(personId)) return null;
  const shows = (from: ID | null): from is ID =>
    from !== null && reachableFrom(g, from).has(personId);
  const from = shows(focusId) ? focusId : shows(start) ? start : personId;
  const full = buildDescendantTree(g, from);
  const open = full ? keysToReveal(full, personId) : null;
  const base: readonly string[] = saved ?? (full ? initialCollapsed(full) : []);
  const next = open ? base.filter((key) => !open.includes(key)) : base;
  return { from, collapsed: next.length !== base.length ? [...next] : null };
}
