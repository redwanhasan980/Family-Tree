import { childLinksOf, type FamilyGraph } from './build';
import { partnersOf } from './families';

import type { ID } from '../types';

/**
 * Generation numbers from `rootId` (the root is generation 1; SRS §1.3). Descendants get
 * their shortest distance; partners who aren't descendants share their partner's
 * generation, so a daughter-in-law sits beside her husband.
 */
export function computeGenerations(g: FamilyGraph, rootId: ID): Map<ID, number> {
  const generation = new Map<ID, number>();
  if (!g.persons.has(rootId)) return generation;
  generation.set(rootId, 1);
  const queue = [rootId];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]!;
    for (const link of childLinksOf(g, id)) {
      if (!generation.has(link.childId)) {
        generation.set(link.childId, generation.get(id)! + 1);
        queue.push(link.childId);
      }
    }
  }
  for (const id of queue) {
    for (const partner of partnersOf(g, id)) {
      if (!generation.has(partner)) generation.set(partner, generation.get(id)!);
    }
  }
  return generation;
}

/**
 * People shown when the tree starts at `rootId`: the root, their descendants, and the
 * partners of all of them (DESIGN §12.6).
 */
export function reachableFrom(g: FamilyGraph, rootId: ID): Set<ID> {
  return new Set(computeGenerations(g, rootId).keys());
}

/** People the views starting at `rootId` can't show, for the "Unplaced people" tray (REL-11). */
export function unplacedPersons(g: FamilyGraph, rootId: ID | undefined): ID[] {
  const placed = rootId ? reachableFrom(g, rootId) : new Set<ID>();
  return [...g.persons.keys()].filter((id) => !placed.has(id));
}
