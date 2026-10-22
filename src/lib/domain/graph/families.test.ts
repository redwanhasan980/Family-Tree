import { describe, expect, it } from 'vitest';

import { buildGraph } from './build';
import {
  childrenOf,
  getFamilies,
  otherParentOf,
  parentsOf,
  partnersOf,
  siblingsOf,
} from './families';
import { makeParentLink, makePerson, makeSpouseLink } from '../fixtures/factories';
import { testFamily } from '../fixtures/testFamily';

const { persons, relationships } = testFamily();
const g = buildGraph(persons, relationships);

describe('getFamilies', () => {
  it('groups children by the other parent, wives in marriage order, unknown last', () => {
    expect(
      getFamilies(g, 'G').map((f) => [f.partnerId, f.spouseLink?.id ?? null, f.childIds]),
    ).toEqual([
      ['W1', 's_G_W1', ['S1', 'D1']],
      ['W2', 's_G_W2', ['S2']],
      [null, null, ['X']],
    ]);
  });

  it('includes co-parents without a marriage record', () => {
    expect(getFamilies(g, 'X')).toEqual([{ partnerId: 'P', childIds: ['Y'] }]);
  });

  it('keeps childless marriages as empty families', () => {
    const solo = buildGraph([makePerson('a'), makePerson('b')], [makeSpouseLink('a', 'b')]);
    expect(getFamilies(solo, 'a')).toEqual([
      { partnerId: 'b', spouseLink: makeSpouseLink('a', 'b'), childIds: [] },
    ]);
    expect(getFamilies(solo, 'nobody')).toEqual([]);
  });

  it('shows a child under the closest other parent', () => {
    const family = buildGraph(
      ['dad', 'mum', 'step', 'kid'].map((id) => makePerson(id)),
      [
        makeSpouseLink('dad', 'step'),
        makeParentLink('dad', 'kid'),
        makeParentLink('step', 'kid', 'step'),
        makeParentLink('mum', 'kid'),
      ],
    );
    expect(otherParentOf(family, 'dad', 'kid')).toBe('mum');
    expect(otherParentOf(family, 'step', 'kid')).toBe('dad');
    expect(getFamilies(family, 'dad').map((f) => [f.partnerId, f.childIds])).toEqual([
      ['step', []],
      ['mum', ['kid']],
    ]);
  });

  it('prefers a spouse among equally close other parents', () => {
    const family = buildGraph(
      ['p', 'a', 'z', 'kid'].map((id) => makePerson(id)),
      [
        makeSpouseLink('p', 'z'),
        makeParentLink('p', 'kid'),
        makeParentLink('a', 'kid', 'adoptive'),
        makeParentLink('z', 'kid', 'adoptive'),
      ],
    );
    expect(otherParentOf(family, 'p', 'kid')).toBe('z');
  });
});

describe('relatives', () => {
  it('lists partners, parents, children and siblings', () => {
    expect(partnersOf(g, 'G')).toEqual(['W1', 'W2']);
    expect(parentsOf(g, 'S1')).toEqual(['G', 'W1']);
    expect(childrenOf(g, 'G')).toEqual(['S1', 'D1', 'S2', 'X']);
    expect(childrenOf(g, 'G', 'W2')).toEqual(['S2']);
    expect(childrenOf(g, 'G', null)).toEqual(['X']);
    expect(childrenOf(g, 'G', 'nobody')).toEqual([]);
    expect(siblingsOf(g, 'S1')).toEqual(['D1', 'S2', 'X']);
    expect(siblingsOf(g, 'O')).toEqual([]);
  });
});
