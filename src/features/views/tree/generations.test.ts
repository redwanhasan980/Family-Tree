import { describe, expect, it } from 'vitest';

import { testFamily } from '@/lib/domain/fixtures/testFamily';
import { buildDescendantTree, buildGraph } from '@/lib/domain/graph';

import { generationBands } from './generations';
import { COMFORTABLE, COMPACT, layoutTree } from './layout';

const { persons, relationships } = testFamily();
const tree = buildDescendantTree(buildGraph(persons, relationships), 'G')!;

describe('generationBands (TV-10)', () => {
  it('gives each generation one row, top to bottom', () => {
    const bands = generationBands(layoutTree(tree), 'vertical');
    expect(bands.map((band) => band.depth)).toEqual([0, 1, 2, 3]);
    const step = COMFORTABLE.cardH + COMFORTABLE.levelGap;
    for (const [index, band] of bands.entries()) {
      expect(band.end - band.start).toBe(COMFORTABLE.cardH);
      if (index > 0) expect(band.start - bands[index - 1]!.start).toBe(step);
    }
  });

  it('runs across when the tree goes left to right', () => {
    const layout = layoutTree(tree, COMPACT, 'horizontal');
    const bands = generationBands(layout, 'horizontal');
    expect(bands).toHaveLength(4);
    expect(bands[1]!.start).toBeGreaterThan(bands[0]!.end);
    const focus = layout.cards.find((card) => card.key === 'G')!;
    expect(bands[0]).toMatchObject({ start: focus.x, end: focus.x + focus.w });
  });
});
