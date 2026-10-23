import { describe, expect, it } from 'vitest';

import { makePerson, stamps } from '@/lib/domain/fixtures/factories';
import { testFamily } from '@/lib/domain/fixtures/testFamily';
import { buildGraph } from '@/lib/domain/graph';

import { planReveal, startingPerson } from './focus';

const { persons, relationships } = testFamily();
const g = buildGraph(persons, relationships);

describe('startingPerson', () => {
  it('uses the root, else the first-added person without parents', () => {
    expect(startingPerson(g, 'S1')).toBe('S1');
    expect(startingPerson(g, 'gone')).toBe('G');
    expect(startingPerson(g, undefined)).toBe('G');
    expect(startingPerson(buildGraph([], []), undefined)).toBeNull();
  });

  it('falls back to anyone when everyone has parents', () => {
    const only = makePerson('Z', { ...stamps(5) });
    expect(startingPerson(buildGraph([only], []), undefined)).toBe('Z');
  });
});

describe('planReveal (VIS-04)', () => {
  it('keeps the start and opens the collapsed branches on the way', () => {
    expect(planReveal(g, 'K', 'G', 'G', ['G/S1', 'G/D1'])).toEqual({
      from: 'G',
      collapsed: ['G/D1'],
    });
    expect(planReveal(g, 'S2', 'G', 'G', ['G/S1'])).toEqual({ from: 'G', collapsed: null });
  });

  it('goes back to the tree’s start, or starts from someone not in it', () => {
    expect(planReveal(g, 'S2', 'S1', 'G', [])).toEqual({ from: 'G', collapsed: null });
    expect(planReveal(g, 'O', 'G', 'G', undefined)).toEqual({ from: 'O', collapsed: null });
    expect(planReveal(g, 'missing', 'G', 'G', [])).toBeNull();
  });
});
