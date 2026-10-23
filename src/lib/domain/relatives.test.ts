import { describe, expect, it } from 'vitest';

import { makeParentLink, makePerson } from './fixtures/factories';
import { testFamily } from './fixtures/testFamily';
import { buildGraph } from './graph';
import {
  likelySpouseGender,
  missingParentGender,
  otherParentChoices,
  spouseRelation,
} from './relatives';

const family = testFamily();
const g = buildGraph(family.persons, family.relationships);

describe('relative words and defaults (REL-12)', () => {
  it('names a spouse by the person’s gender', () => {
    expect(spouseRelation('male')).toBe('wife');
    expect(spouseRelation('female')).toBe('husband');
    expect(spouseRelation('unknown')).toBe('other');
    expect(likelySpouseGender('male')).toBe('female');
    expect(likelySpouseGender('female')).toBe('male');
    expect(likelySpouseGender('unknown')).toBe(null);
  });

  it('suggests the missing parent', () => {
    expect(missingParentGender(g, 'X')).toBe('female');
    expect(missingParentGender(g, 'S1')).toBe(null);
    expect(missingParentGender(g, 'G')).toBe(null);
    const mumOnly = buildGraph(
      [makePerson('m', { gender: 'female' }), makePerson('c')],
      [makeParentLink('m', 'c')],
    );
    expect(missingParentGender(mumOnly, 'c')).toBe('male');
  });

  it('offers spouses and co-parents as the other parent', () => {
    expect(otherParentChoices(g, 'G')).toEqual(['W1', 'W2']);
    expect(otherParentChoices(g, 'X')).toEqual(['P']);
  });
});
