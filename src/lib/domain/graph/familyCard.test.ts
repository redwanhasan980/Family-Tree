import { describe, expect, it } from 'vitest';

import { buildGraph } from './build';
import { buildFamilyCard, trailTo } from './familyCard';
import { makeParentLink, makePerson } from '../fixtures/factories';
import { testFamily } from '../fixtures/testFamily';

const { persons, relationships } = testFamily();
const g = buildGraph(persons, relationships);

describe('buildFamilyCard (FC-01, P6-10)', () => {
  it('shows the parents above, with their marriage', () => {
    const card = buildFamilyCard(g, 'S1', 'G')!;
    expect(card).toMatchObject({ focusId: 'S1', fatherId: 'G', motherId: 'W1', otherParents: [] });
    expect(card.parentsLink?.personIds).toEqual(['G', 'W1'].sort());
  });

  it('keeps each marriage’s children apart, in marriage order (FC-03)', () => {
    const card = buildFamilyCard(g, 'G', 'G')!;
    expect(card.partners.map((p) => [p.personId, p.childIds])).toEqual([
      ['W1', ['S1', 'D1']],
      ['W2', ['S2']],
      [null, ['X']],
    ]);
    expect(card.partners[0]!.link?.sequence).toBe(1);
    expect(card.fatherId).toBeNull();
    expect(card.trail).toEqual(['G']);
  });

  it('counts each child’s children (FC-05)', () => {
    const card = buildFamilyCard(g, 'G')!;
    expect(Object.fromEntries(card.childCounts)).toEqual({ S1: 1, D1: 1, S2: 1, X: 1 });
    expect(Object.fromEntries(buildFamilyCard(g, 'S2')!.childCounts)).toEqual({ A: 0 });
  });

  it('lists the brothers and sisters with the focus person, in order (FC-07)', () => {
    expect(buildFamilyCard(g, 'D1')!.siblingIds).toEqual(['S1', 'D1', 'S2', 'X']);
    expect(buildFamilyCard(g, 'O')!.siblingIds).toEqual(['O']);
  });

  it('shows adoptive parents apart, and parents without a marriage record', () => {
    expect(buildFamilyCard(g, 'A')).toMatchObject({
      fatherId: null,
      motherId: null,
      otherParents: [{ personId: 'S2', kind: 'adoptive' }],
    });
    expect(buildFamilyCard(g, 'Y')).toMatchObject({
      fatherId: 'X',
      motherId: 'P',
      parentsLink: null,
    });
  });

  it('puts a parent of unknown gender with the other parents', () => {
    const unsure = buildGraph(
      [makePerson('c'), makePerson('p', { gender: 'unknown' })],
      [makeParentLink('p', 'c')],
    );
    expect(buildFamilyCard(unsure, 'c')!.otherParents).toEqual([
      { personId: 'p', kind: 'biological' },
    ]);
  });

  it('returns null for someone not in the tree', () => {
    expect(buildFamilyCard(g, 'nobody')).toBeNull();
  });
});

describe('trailTo (FC-02)', () => {
  it('walks down from the start, the father’s line first', () => {
    // K's parents are cousins: both lines reach G in three steps.
    expect(trailTo(g, 'G', 'K')).toEqual(['G', 'S1', 'SS', 'K']);
    expect(buildFamilyCard(g, 'K', 'G')!.trail).toEqual(['G', 'S1', 'SS', 'K']);
    expect(trailTo(g, 'W2', 'A')).toEqual(['W2', 'S2', 'A']);
  });

  it('is empty when the start isn’t an ancestor', () => {
    expect(trailTo(g, 'G', 'O')).toEqual([]);
    expect(trailTo(g, 'S1', 'D1')).toEqual([]);
    expect(trailTo(g, 'G', 'missing')).toEqual([]);
    expect(buildFamilyCard(g, 'O', 'G')!.trail).toEqual([]);
  });
});
