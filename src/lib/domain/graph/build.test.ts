import { describe, expect, it } from 'vitest';

import { buildGraph, childLinksOf, parentLinksOf, partnerIn, spouseLinksOf } from './build';
import { makeParentLink, makePerson, makeSpouseLink } from '../fixtures/factories';
import { testFamily } from '../fixtures/testFamily';

import type { Relationship } from '../types';

describe('buildGraph', () => {
  it('indexes parents, children and spouses', () => {
    const { persons, relationships } = testFamily();
    const g = buildGraph(persons, relationships);
    expect(g.persons.size).toBe(16);
    expect(g.links.size).toBe(relationships.length);
    expect(g.issues).toEqual([]);
    expect(childLinksOf(g, 'G').map((l) => l.childId)).toEqual(['S1', 'D1', 'S2', 'X']);
    expect(parentLinksOf(g, 'K').map((l) => l.parentId)).toEqual(['SS', 'DD']);
    expect(spouseLinksOf(g, 'G').map((l) => partnerIn(l, 'G'))).toEqual(['W2', 'W1']);
    expect(childLinksOf(g, 'O')).toEqual([]);
  });

  it('accepts a map of persons', () => {
    const p = makePerson('a');
    expect(buildGraph(new Map([['a', p]]), []).persons.get('a')).toBe(p);
  });

  it('skips and reports broken relationships instead of failing', () => {
    const persons = ['a', 'b'].map((id) => makePerson(id));
    const self = { ...makeParentLink('a', 'b'), id: 'p_a_a', childId: 'a' } as Relationship;
    const selfSpouse = {
      ...makeSpouseLink('a', 'b'),
      id: 's_a_a',
      personIds: ['a', 'a'],
    } as Relationship;
    const dangling = makeParentLink('a', 'ghost');
    const danglingSpouse = makeSpouseLink('a', 'ghost');
    const mislabelled = { ...makeParentLink('a', 'b'), id: 'p_b_a' } as Relationship;
    const unsorted = { ...makeSpouseLink('a', 'b'), personIds: ['b', 'a'] } as Relationship;
    const good = makeParentLink('a', 'b');
    const g = buildGraph(persons, [
      self,
      selfSpouse,
      dangling,
      danglingSpouse,
      mislabelled,
      unsorted,
      good,
      good,
    ]);
    expect(g.issues.map((i) => [i.code, i.linkId])).toEqual([
      ['selfLink', 'p_a_a'],
      ['selfLink', 's_a_a'],
      ['danglingLink', 'p_a_ghost'],
      ['danglingLink', 's_a_ghost'],
      ['idMismatch', 'p_b_a'],
      ['idMismatch', 's_a_b'],
      ['duplicateLink', 'p_a_b'],
    ]);
    expect([...g.links.keys()]).toEqual(['p_a_b']);
  });

  it('reports loops but keeps them, so nothing disappears', () => {
    const persons = ['a', 'b', 'c'].map((id) => makePerson(id));
    const g = buildGraph(persons, [
      makeParentLink('a', 'b'),
      makeParentLink('b', 'c'),
      makeParentLink('c', 'a'),
    ]);
    expect(g.issues).toEqual([{ code: 'cycle', linkId: 'p_c_a' }]);
    expect(g.links.size).toBe(3);
  });

  it('orders children by explicit order, then birth date', () => {
    const persons = [
      makePerson('p'),
      makePerson('old', { birth: { date: { year: 1950 } } }),
      makePerson('young', { birth: { date: { year: 1960 } } }),
      makePerson('added', { childOrder: 2 }),
      makePerson('first', { childOrder: -1 }),
    ];
    const g = buildGraph(
      persons,
      ['young', 'added', 'old', 'first'].map((c) => makeParentLink('p', c)),
    );
    // Keys: first -1, old 0 (by birth), young 1, added 2.
    expect(childLinksOf(g, 'p').map((l) => l.childId)).toEqual(['first', 'old', 'young', 'added']);
  });
});
