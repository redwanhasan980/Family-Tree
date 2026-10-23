import { describe, expect, it } from 'vitest';

import { makeParentLink, makePerson, makeSpouseLink } from '@/lib/domain/fixtures/factories';
import { testFamily } from '@/lib/domain/fixtures/testFamily';
import { buildAncestorTree, buildGraph } from '@/lib/domain/graph';

import { COMFORTABLE, COMPACT } from './layout';
import { createNavigator } from './navigation';
import { layoutPedigree } from './pedigree';

const { persons, relationships } = testFamily();
const g = buildGraph(persons, relationships);
// K's parents are cousins: SS (S1's son) and DD (D1's daughter), both grandchildren of G.
const layout = layoutPedigree(buildAncestorTree(g, 'K')!);
const card = (key: string) => layout.cards.find((c) => c.key === key)!;
const middle = (key: string) => card(key).y + card(key).h / 2;

describe('layoutPedigree (TV-06)', () => {
  it('puts the person on the left and each generation in its own column', () => {
    expect(card('K')).toMatchObject({ x: 0, depth: 0 });
    const step = COMFORTABLE.cardW + COMFORTABLE.levelGap;
    expect(card('K/SS').x).toBe(step);
    expect(card('K/SS/S1').x).toBe(step * 2);
    expect(card('K/SS/S1/G').x).toBe(step * 3);
  });

  it('places the father above the mother and the child between them', () => {
    expect(middle('K/SS')).toBeLessThan(middle('K/DD'));
    expect(middle('K')).toBeCloseTo((middle('K/SS') + middle('K/DD')) / 2);
    expect(middle('K/SS/S1')).toBeLessThan(middle('K/SS/SW'));
  });

  it('draws one repeated ancestor as a link (pedigree collapse)', () => {
    // G and W1 are reached through both parents; the second time they are links.
    expect(card('K/SS/S1/G').isRef).toBe(false);
    expect(card('K/DD/D1/G').isRef).toBe(true);
    expect(layout.cardsOf.get('G')).toEqual(['K/SS/S1/G', 'K/DD/D1/G']);
  });

  it('never overlaps cards', () => {
    for (const a of layout.cards) {
      for (const b of layout.cards) {
        if (a === b || a.x !== b.x) continue;
        expect(a.y + a.h <= b.y || b.y + b.h <= a.y, `${a.key} / ${b.key}`).toBe(true);
      }
    }
  });

  it('connects each person to their parents, dashed for adoptive ones', () => {
    expect(layout.lines.filter((l) => l.key.startsWith('K>'))).toHaveLength(2);
    const adopted = layoutPedigree(buildAncestorTree(g, 'A')!, COMPACT);
    expect(adopted.lines.map((l) => [l.key, l.dashed])).toEqual([
      ['A/S2>G', false],
      ['A/S2>W2', false],
      ['A>S2', true],
    ]);
    expect(layout.lines.every((l) => !l.dashed)).toBe(true);
    expect(layout.bounds.minX).toBe(0);
  });

  it('marks people whose ancestors go on beyond the last column', () => {
    const short = layoutPedigree(buildAncestorTree(g, 'K', { maxDepth: 1 })!);
    expect([...short.more].sort()).toEqual(['K/DD', 'K/SS']);
    expect(short.cards).toHaveLength(3);
  });

  it('moves with the arrow keys: right to the parents, up and down a generation', () => {
    const navigate = createNavigator(layout, 'horizontal');
    expect(navigate(card('K'), 'child')?.key).toMatch(/^K\/(SS|DD)$/);
    expect(navigate(card('K/SS'), 'parent')?.key).toBe('K');
    expect(navigate(card('K/SS'), 'next')?.key).toBe('K/DD');
  });

  it('lays out someone without parents as one card', () => {
    const alone = buildGraph(
      [makePerson('a'), makePerson('b'), makePerson('c')],
      [makeSpouseLink('a', 'b'), makeParentLink('a', 'c')],
    );
    expect(layoutPedigree(buildAncestorTree(alone, 'a')!).cards).toHaveLength(1);
    expect(layoutPedigree(buildAncestorTree(alone, 'c')!).cards).toHaveLength(2);
  });
});
