import { describe, expect, it } from 'vitest';

import { generateFamily } from '@/lib/domain/fixtures/generate';
import { testFamily } from '@/lib/domain/fixtures/testFamily';
import { buildDescendantTree, buildGraph } from '@/lib/domain/graph';

import { layoutTree } from './layout';
import { wantsMinimap } from './Minimap';

const screen = { width: 1200, height: 800 };

describe('wantsMinimap (TV-07)', () => {
  it('is for trees too big to see whole at half size', () => {
    const small = testFamily();
    const smallTree = buildDescendantTree(buildGraph(small.persons, small.relationships), 'G')!;
    expect(wantsMinimap(layoutTree(smallTree), screen)).toBe(false);

    const big = generateFamily({ size: 200 });
    const graph = buildGraph(big.persons, big.relationships);
    const bigTree = buildDescendantTree(graph, big.rootId)!;
    expect(wantsMinimap(layoutTree(bigTree), screen)).toBe(true);
  });

  it('waits until the view has a size', () => {
    const big = generateFamily({ size: 200 });
    const bigTree = buildDescendantTree(buildGraph(big.persons, big.relationships), big.rootId)!;
    expect(wantsMinimap(layoutTree(bigTree), { width: 0, height: 0 })).toBe(false);
  });
});
