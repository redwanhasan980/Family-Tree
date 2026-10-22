import { describe, expect, it } from 'vitest';

import { ancestorIds, buildAncestorTree, type AncNode } from './ancestors';
import { buildGraph } from './build';
import {
  buildDescendantTree,
  countDescendants,
  descendantIds,
  MAX_DEPTH,
  walkDescendants,
  type DescNode,
} from './descendants';
import { makeParentLink, makePerson } from '../fixtures/factories';
import { testFamily } from '../fixtures/testFamily';

const { persons, relationships } = testFamily();
const g = buildGraph(persons, relationships);

/** Compact outline: "G>S1>SS>K" with refs marked "~". */
function outline(root: DescNode): string[] {
  const lines: string[] = [];
  walkDescendants(root, (node) =>
    lines.push(`${'  '.repeat(node.depth)}${node.isRef ? '~' : ''}${node.personId}`),
  );
  return lines;
}

describe('buildDescendantTree', () => {
  it('lays out every family in order, with repeated people as references', () => {
    const root = buildDescendantTree(g, 'G')!;
    expect(outline(root)).toEqual([
      'G',
      '  S1',
      '    SS',
      '      K',
      '  D1',
      '    DD',
      '      ~K',
      '  S2',
      '    A',
      '  X',
      '    Y',
    ]);
  });

  it('describes partners, including bloodline partners in a cousin marriage', () => {
    const root = buildDescendantTree(g, 'G')!;
    expect(root.partners).toEqual([
      { personId: 'W1', linkId: 's_G_W1', status: 'married', isAlsoBloodline: false },
      { personId: 'W2', linkId: 's_G_W2', status: 'married', isAlsoBloodline: false },
    ]);
    const ss = root.children[0]!.children[0]!;
    expect(ss.partners).toEqual([
      { personId: 'DD', linkId: 's_DD_SS', status: 'married', isAlsoBloodline: true },
    ]);
    const x = root.children[3]!;
    expect(x.partners).toEqual([{ personId: 'P', isAlsoBloodline: false }]);
    expect(root.children.map((c) => c.viaPartnerId)).toEqual(['W1', 'W1', 'W2', null]);
  });

  it('uses path keys, so each occurrence has its own key', () => {
    const root = buildDescendantTree(g, 'G')!;
    const keys: string[] = [];
    walkDescendants(root, (node) => node.personId === 'K' && keys.push(node.key));
    expect(keys).toEqual(['G/S1/SS/K', 'G/D1/DD/K']);
  });

  it('hides collapsed branches and counts distinct hidden people', () => {
    const root = buildDescendantTree(g, 'G', { collapsed: new Set(['G/S1']) })!;
    const s1 = root.children[0]!;
    expect(s1).toMatchObject({ collapsed: true, children: [], hiddenCount: 2 });
    // K is no longer placed under S1, so D1's branch shows it as the primary.
    expect(outline(root)).toContain('      K');
    expect(buildDescendantTree(g, 'G', { collapsed: new Set(['G']) })!.hiddenCount).toBe(9);
  });

  it('stops at a depth limit and counts the rest', () => {
    const root = buildDescendantTree(g, 'G', { maxDepth: 1 })!;
    expect(root.children.map((c) => [c.personId, c.hiddenCount, c.collapsed])).toEqual([
      ['S1', 2, false],
      ['D1', 2, false],
      ['S2', 1, false],
      ['X', 1, false],
    ]);
  });

  it('survives loops and returns null for unknown people', () => {
    const loop = buildGraph(
      ['a', 'b'].map((id) => makePerson(id)),
      [makeParentLink('a', 'b'), makeParentLink('b', 'a')],
    );
    expect(outline(buildDescendantTree(loop, 'a')!)).toEqual(['a', '  b', '    ~a']);
    expect(descendantIds(loop, 'a')).toEqual(new Set(['b']));
    expect(buildDescendantTree(g, 'nobody')).toBeNull();
  });

  it('caps very deep chains instead of overflowing', () => {
    const ids = Array.from({ length: MAX_DEPTH + 50 }, (_, i) => `p${i}`);
    const chain = buildGraph(
      ids.map((id) => makePerson(id)),
      ids.slice(1).map((id, i) => makeParentLink(ids[i]!, id)),
    );
    let deepest: DescNode | null = null;
    walkDescendants(buildDescendantTree(chain, 'p0')!, (node) => (deepest = node));
    expect(deepest!).toMatchObject({ depth: MAX_DEPTH, hiddenCount: 49 });
  });

  it('counts each shared descendant once and remembers the answer', () => {
    expect(countDescendants(g, 'G')).toBe(9);
    expect(countDescendants(g, 'G')).toBe(9);
    expect(countDescendants(g, 'K')).toBe(0);
  });
});

describe('buildAncestorTree', () => {
  function pedigree(node: AncNode): string[] {
    return [
      `${'  '.repeat(node.depth)}${node.isRef ? '~' : ''}${node.personId}${node.kind ? ` (${node.kind})` : ''}${node.hasMore ? ' +' : ''}`,
      ...node.parents.flatMap(pedigree),
    ];
  }

  it('lists fathers before mothers and marks repeated ancestors', () => {
    expect(pedigree(buildAncestorTree(g, 'K')!)).toEqual([
      'K',
      '  SS (biological)',
      '    S1 (biological)',
      '      G (biological)',
      '      W1 (biological)',
      '    SW (biological)',
      '  DD (biological)',
      '    H (biological)',
      '    D1 (biological)',
      '      ~G (biological)',
      '      ~W1 (biological)',
    ]);
    expect(pedigree(buildAncestorTree(g, 'A')!)).toEqual([
      'A',
      '  S2 (adoptive)',
      '    G (biological)',
      '    W2 (biological)',
    ]);
  });

  it('notes ancestors beyond the depth limit', () => {
    expect(pedigree(buildAncestorTree(g, 'K', { maxDepth: 1 })!)).toEqual([
      'K',
      '  SS (biological) +',
      '  DD (biological) +',
    ]);
    expect(buildAncestorTree(g, 'nobody')).toBeNull();
  });

  it('collects all ancestors', () => {
    expect(ancestorIds(g, 'K')).toEqual(new Set(['SS', 'DD', 'S1', 'SW', 'H', 'D1', 'G', 'W1']));
  });
});
