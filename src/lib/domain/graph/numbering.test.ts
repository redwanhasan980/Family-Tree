import { describe, expect, it } from 'vitest';

import { buildGraph } from './build';
import { buildDescendantTree } from './descendants';
import { computeGenerations, reachableFrom, unplacedPersons } from './generations';
import { branchOf, dAboville } from './numbering';
import { testFamily } from '../fixtures/testFamily';

const { persons, relationships } = testFamily();
const g = buildGraph(persons, relationships);
const root = buildDescendantTree(g, 'G')!;

describe('generations', () => {
  it('numbers descendants from 1 and gives partners their partner’s generation', () => {
    expect(Object.fromEntries(computeGenerations(g, 'G'))).toEqual({
      G: 1,
      W1: 1,
      W2: 1,
      S1: 2,
      D1: 2,
      S2: 2,
      X: 2,
      SW: 2,
      H: 2,
      P: 2,
      SS: 3,
      DD: 3,
      A: 3,
      Y: 3,
      K: 4,
    });
    expect(computeGenerations(g, 'nobody').size).toBe(0);
  });

  it('lists people the tree from its root cannot show (REL-11)', () => {
    expect(reachableFrom(g, 'S1')).toEqual(new Set(['S1', 'SW', 'SS', 'DD', 'K']));
    expect(unplacedPersons(g, 'G')).toEqual(['O']);
    expect(unplacedPersons(g, undefined)).toHaveLength(16);
  });
});

describe('numbering', () => {
  it("gives d'Aboville numbers by position (LV-01)", () => {
    const numbers = dAboville(root);
    expect(numbers.get('G')).toBe('1');
    expect(numbers.get('G/S1/SS/K')).toBe('1.1.1.1');
    expect(numbers.get('G/D1/DD/K')).toBe('1.2.1.1');
    expect(numbers.get('G/X/Y')).toBe('1.4.1');
    expect(numbers.size).toBe(11);
  });

  it('assigns each node the branch of the first-generation child it descends from', () => {
    const branches = branchOf(root);
    expect(branches.get('G')).toBeNull();
    expect(branches.get('G/S1')).toBe(0);
    expect(branches.get('G/S1/SS/K')).toBe(0);
    expect(branches.get('G/D1/DD/K')).toBe(1);
    expect(branches.get('G/X/Y')).toBe(3);
  });
});
