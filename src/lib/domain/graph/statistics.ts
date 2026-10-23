import { computeGenerations } from './generations';

import type { FamilyGraph } from './build';
import type { ID } from '../types';

export interface TreeStatistics {
  people: number;
  /** Generations below and including the root (0 without a root). */
  generations: number;
  living: number;
  deceased: number;
  /** The earliest recorded birth year, if any. */
  earliestBirthYear?: number;
}

/** Numbers for the statistics popover (TREE-08). */
export function treeStatistics(g: FamilyGraph, rootId: ID | undefined): TreeStatistics {
  let living = 0;
  let earliest: number | undefined;
  for (const person of g.persons.values()) {
    if (person.isLiving) living += 1;
    const year = person.birth?.date?.year;
    if (year !== undefined && (earliest === undefined || year < earliest)) earliest = year;
  }
  const generations = rootId ? Math.max(0, ...computeGenerations(g, rootId).values()) : 0;
  return {
    people: g.persons.size,
    generations,
    living,
    deceased: g.persons.size - living,
    ...(earliest !== undefined && { earliestBirthYear: earliest }),
  };
}
