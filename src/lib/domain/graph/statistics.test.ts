import { describe, expect, it } from 'vitest';

import { buildGraph } from './build';
import { treeStatistics } from './statistics';
import { makePerson } from '../fixtures/factories';
import { testFamily } from '../fixtures/testFamily';

describe('treeStatistics (TREE-08)', () => {
  it('counts people, generations, living and deceased, and the earliest birth', () => {
    const { persons, relationships } = testFamily();
    const g = buildGraph(
      persons.map((p) => (p.id === 'G' || p.id === 'W1' ? { ...p, isLiving: false } : p)),
      relationships,
    );
    expect(treeStatistics(g, 'G')).toEqual({
      people: 16,
      generations: 4,
      living: 14,
      deceased: 2,
      earliestBirthYear: 1925,
    });
  });

  it('works without a root or birth dates', () => {
    const g = buildGraph([makePerson('a')], []);
    expect(treeStatistics(g, undefined)).toEqual({
      people: 1,
      generations: 0,
      living: 1,
      deceased: 0,
    });
    expect(treeStatistics(buildGraph([], []), 'missing')).toEqual({
      people: 0,
      generations: 0,
      living: 0,
      deceased: 0,
    });
  });
});
