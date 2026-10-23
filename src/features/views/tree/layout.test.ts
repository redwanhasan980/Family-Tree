import { describe, expect, it } from 'vitest';

import { generateFamily } from '@/lib/domain/fixtures/generate';
import { testFamily } from '@/lib/domain/fixtures/testFamily';
import { buildDescendantTree, buildGraph } from '@/lib/domain/graph';

import { COMFORTABLE, COMPACT, layoutTree, type LaidCard, type TreeLayout } from './layout';

const { persons, relationships } = testFamily();
const g = buildGraph(persons, relationships);
const tree = buildDescendantTree(g, 'G')!;

const cardOf = (layout: TreeLayout, key: string) => layout.cards.find((c) => c.key === key)!;
const centreX = (card: LaidCard) => card.x + card.w / 2;

function overlaps(a: LaidCard, b: LaidCard): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function expectNoOverlaps(layout: TreeLayout) {
  const cards = [...layout.cards].sort((a, b) => a.y - b.y || a.x - b.x);
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length && cards[j]!.y < cards[i]!.y + cards[i]!.h; j++) {
      expect(overlaps(cards[i]!, cards[j]!), `${cards[i]!.key} / ${cards[j]!.key}`).toBe(false);
    }
  }
}

describe('layoutTree (TV-01)', () => {
  const layout = layoutTree(tree);

  it('draws two wives on either side of their husband', () => {
    const [w1, gf, w2] = ['G+W1', 'G', 'G+W2'].map((k) => cardOf(layout, k));
    expect(w1!.x).toBeLessThan(gf!.x);
    expect(gf!.x).toBeLessThan(w2!.x);
    expect(new Set([w1!.y, gf!.y, w2!.y]).size).toBe(1);
    expect(w1).toMatchObject({ role: 'partner', personId: 'W1', nodeKey: 'G', depth: 0 });
  });

  it('places each generation one level lower, children under their parents', () => {
    const g0 = cardOf(layout, 'G');
    const s1 = cardOf(layout, 'G/S1');
    const k = cardOf(layout, 'G/S1/SS/K');
    expect(s1.y).toBe(g0.y + COMFORTABLE.cardH + COMFORTABLE.levelGap);
    expect(k.depth).toBe(3);
    // W1's children sit left of W2's.
    expect(centreX(cardOf(layout, 'G/D1'))).toBeLessThan(centreX(cardOf(layout, 'G/S2')));
  });

  it('never overlaps cards', () => {
    expectNoOverlaps(layout);
    expectNoOverlaps(layoutTree(tree, COMPACT, 'horizontal'));
  });

  it('marks cousin marriages and repeated people (VIS-08, VIS-09)', () => {
    expect(cardOf(layout, 'G/S1/SS+DD')).toMatchObject({ isAlsoBloodline: true });
    expect(cardOf(layout, 'G/D1/DD/K')).toMatchObject({ isRef: true });
    expect(cardOf(layout, 'G/D1/DD/K').toggle).toBeUndefined();
    expect(layout.cardsOf.get('K')).toEqual(['G/S1/SS/K', 'G/D1/DD/K']);
    // DD as herself and as SS's wife.
    expect(layout.cardsOf.get('DD')).toEqual(['G/S1/SS+DD', 'G/D1/DD']);
  });

  it('connects couples and their children', () => {
    const marriages = layout.lines.filter((l) => l.kind === 'marriage');
    const descents = layout.lines.filter((l) => l.kind === 'descent');
    // G–W1, G–W2, S1–SW, SS–DD, D1–H, DD–SS, X–P.
    expect(marriages).toHaveLength(7);
    expect(marriages.find((l) => l.key === 'm:G/X+P')).toMatchObject({ dashed: true });
    expect(marriages.find((l) => l.key === 'm:G+W1')).toMatchObject({ dashed: false });
    expect(marriages.find((l) => l.key === 'm:G+W1')!.ring).toBeDefined();
    expect(marriages.find((l) => l.key === 'm:G/X+P')!.ring).toBeUndefined();
    // G has three families (W1, W2, unknown); every path starts with a move.
    expect(descents.filter((l) => l.key.startsWith('d:G:'))).toHaveLength(3);
    for (const line of layout.lines) expect(line.d).toMatch(/^M-?\d/);
  });

  it('has a toggle on people with descendants', () => {
    expect(cardOf(layout, 'G').toggle).toMatchObject({ collapsed: false, hiddenCount: 0 });
    expect(cardOf(layout, 'G/S2/A').toggle).toBeUndefined();
    const collapsed = layoutTree(buildDescendantTree(g, 'G', { collapsed: new Set(['G/S1']) })!);
    const s1 = cardOf(collapsed, 'G/S1');
    expect(s1.toggle).toMatchObject({ collapsed: true, hiddenCount: 2 });
    expect(s1.toggle!.x).toBe(centreX(s1));
    expect(s1.toggle!.y).toBe(s1.y + s1.h);
    expect(collapsed.cards.some((c) => c.key === 'G/S1/SS')).toBe(false);
  });

  it('runs left to right when horizontal (TV-02)', () => {
    const across = layoutTree(tree, COMFORTABLE, 'horizontal');
    const [w1, gf, w2] = ['G+W1', 'G', 'G+W2'].map((k) => cardOf(across, k));
    expect(new Set([w1!.x, gf!.x, w2!.x]).size).toBe(1);
    expect(w1!.y).toBeLessThan(gf!.y);
    expect(cardOf(across, 'G/S1').x).toBe(gf!.x + COMFORTABLE.cardW + COMFORTABLE.levelGap);
    expect(cardOf(across, 'G').toggle).toMatchObject({ x: gf!.x + gf!.w, y: gf!.y + gf!.h / 2 });
  });

  it('reports bounds that contain every card', () => {
    const { bounds } = layout;
    for (const card of layout.cards) {
      expect(card.x).toBeGreaterThanOrEqual(bounds.minX);
      expect(card.x + card.w).toBeLessThanOrEqual(bounds.maxX);
      expect(card.y + card.h).toBeLessThanOrEqual(bounds.maxY);
    }
  });

  it('is stable for the test family', () => {
    const compactCards = layout.cards.map((c) => `${c.key}@${Math.round(c.x)},${Math.round(c.y)}`);
    expect(compactCards).toMatchSnapshot();
  });
});

describe('layoutTree on generated families', () => {
  it.each([150, 500])('lays out %i people without overlaps', (size) => {
    const family = generateFamily({ size });
    const graph = buildGraph(family.persons, family.relationships);
    const rootId = family.rootId;
    const big = layoutTree(buildDescendantTree(graph, rootId)!, COMPACT);
    expect(big.cards.length).toBeGreaterThan(size * 0.8);
    expectNoOverlaps(big);
  });
});
