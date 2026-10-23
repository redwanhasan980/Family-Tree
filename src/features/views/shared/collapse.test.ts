import { describe, expect, it } from 'vitest';

import { generateFamily } from '@/lib/domain/fixtures/generate';
import { testFamily } from '@/lib/domain/fixtures/testFamily';
import { buildDescendantTree, buildGraph } from '@/lib/domain/graph';

import { cardCount, collapseBeyond, initialCollapsed, keysToReveal } from './collapse';

describe('collapse defaults (VIS-02)', () => {
  const { persons, relationships } = testFamily();
  const tree = buildDescendantTree(buildGraph(persons, relationships), 'G')!;

  it('counts people and partners', () => {
    // 11 nodes (K twice, partners aren't nodes) + partners W1, W2, SW, DD, H, SS, P.
    expect(cardCount(tree)).toBe(11 + 7);
  });

  it('collapses below the last shown generation', () => {
    expect(collapseBeyond(tree, 1)).toEqual(['G']);
    expect(collapseBeyond(tree, 2)).toEqual(['G/S1', 'G/D1', 'G/S2', 'G/X']);
    expect(collapseBeyond(tree, 10)).toEqual([]);
  });

  it('opens small trees fully and big ones three generations deep', () => {
    expect(initialCollapsed(tree)).toEqual([]);
    const big = generateFamily({ size: 500 });
    const bigTree = buildDescendantTree(buildGraph(big.persons, big.relationships), big.rootId)!;
    const keys = initialCollapsed(bigTree);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((key) => key.split('/').length === 3)).toBe(true);
  });

  it('finds what to open to show someone (VIS-04)', () => {
    expect(keysToReveal(tree, 'G')).toEqual([]);
    expect(keysToReveal(tree, 'K')).toEqual(['G', 'G/S1', 'G/S1/SS']);
    // A wife shows beside her husband.
    expect(keysToReveal(tree, 'SW')).toEqual(['G']);
    // DD first appears as SS's wife, before her own card under D1.
    expect(keysToReveal(tree, 'DD')).toEqual(['G', 'G/S1']);
    expect(keysToReveal(tree, 'O')).toBeNull();
  });
});
