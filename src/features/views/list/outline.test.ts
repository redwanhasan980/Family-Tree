import { describe, expect, it } from 'vitest';

import { testFamily } from '@/lib/domain/fixtures/testFamily';
import { buildDescendantTree, buildGraph } from '@/lib/domain/graph';

import {
  droppedOrder,
  familyOf,
  flattenOutline,
  localNumber,
  movedOrder,
  outlineKeyOf,
  outlineStep,
  type OutlineRow,
} from './outline';

const { persons, relationships } = testFamily();
const g = buildGraph(persons, relationships);
const rows = flattenOutline(buildDescendantTree(g, 'G')!);
const row = (key: string) => rows.find((r) => r.key === key)!;
const indexOf = (key: string) => rows.findIndex((r) => r.key === key);

describe('flattenOutline (LV-01)', () => {
  it('lists people depth first with d’Aboville numbers', () => {
    expect(rows.map((r) => [r.key, r.number])).toEqual([
      ['G', '1'],
      ['G/S1', '1.1'],
      ['G/S1/SS', '1.1.1'],
      ['G/S1/SS/K', '1.1.1.1'],
      ['G/D1', '1.2'],
      ['G/D1/DD', '1.2.1'],
      ['G/D1/DD/K', '1.2.1.1'],
      ['G/S2', '1.3'],
      ['G/S2/A', '1.3.1'],
      ['G/X', '1.4'],
      ['G/X/Y', '1.4.1'],
    ]);
  });

  it('keeps partners on the row and marks repeated people', () => {
    expect(row('G').partners.map((p) => p.personId)).toEqual(['W1', 'W2']);
    expect(row('G/S1/SS').partners[0]).toMatchObject({ personId: 'DD', isAlsoBloodline: true });
    expect(row('G/D1/DD/K')).toMatchObject({ isRef: true, expandable: false });
    expect(row('G/S1/SS/K').isRef).toBe(false);
  });

  it('gives ARIA positions among the parent’s children', () => {
    expect(row('G')).toMatchObject({ depth: 0, position: 1, setSize: 1, parentKey: null });
    expect(row('G/S2')).toMatchObject({ depth: 1, position: 3, setSize: 4, parentId: 'G' });
    expect(row('G/X/Y')).toMatchObject({ position: 1, setSize: 1, parentKey: 'G/X' });
  });

  it('notes the other parent when a parent has several families', () => {
    expect(row('G/S1')).toMatchObject({ viaPartnerId: 'W1', parentHasFamilies: true });
    expect(row('G/X')).toMatchObject({ viaPartnerId: null, parentHasFamilies: true });
    expect(row('G/S1/SS')).toMatchObject({ viaPartnerId: 'SW', parentHasFamilies: false });
  });

  it('shows collapsed rows with their hidden count', () => {
    const collapsed = flattenOutline(
      buildDescendantTree(g, 'G', { collapsed: new Set(['G/S1']) })!,
    );
    expect(collapsed.find((r) => r.key === 'G/S1')).toMatchObject({
      expandable: true,
      expanded: false,
      hiddenCount: 2,
    });
    expect(collapsed.some((r) => r.key === 'G/S1/SS')).toBe(false);
    // Numbers don't change when a branch is folded away.
    expect(collapsed.find((r) => r.key === 'G/D1')!.number).toBe('1.2');
  });
});

describe('reordering siblings (LV-03)', () => {
  it('moves within the children of one mother', () => {
    expect(familyOf(rows, row('G/S1'))).toEqual(['S1', 'D1']);
    expect(familyOf(rows, row('G/S2'))).toEqual(['S2']);
    expect(familyOf(rows, row('G'))).toEqual([]);
  });

  it('computes the order after a move up or down', () => {
    expect(movedOrder(['S1', 'D1'], 'D1', -1)).toEqual(['D1', 'S1']);
    expect(movedOrder(['S1', 'D1'], 'S1', 1)).toEqual(['D1', 'S1']);
    expect(movedOrder(['S1', 'D1'], 'S1', -1)).toBeNull();
    expect(movedOrder(['S1', 'D1'], 'D1', 1)).toBeNull();
    expect(movedOrder(['S1'], 'X', 1)).toBeNull();
  });

  it('computes the order after a drop', () => {
    expect(droppedOrder(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b']);
    expect(droppedOrder(['a', 'b', 'c'], 'a', null)).toEqual(['b', 'c', 'a']);
    expect(droppedOrder(['a', 'b', 'c'], 'a', 'b')).toBeNull();
    expect(droppedOrder(['a', 'b'], 'a', 'z')).toBeNull();
    expect(droppedOrder(['a', 'b'], 'z', 'a')).toBeNull();
  });
});

describe('outline keyboard (LV-06)', () => {
  const step = (key: string, k: Parameters<typeof outlineStep>[2], list: OutlineRow[] = rows) =>
    outlineStep(
      list,
      list.findIndex((r) => r.key === key),
      k,
    );

  it('moves up, down, home and end', () => {
    expect(step('G/S1', 'up')).toEqual({ type: 'move', index: 0 });
    expect(step('G/S1', 'down')).toEqual({ type: 'move', index: 2 });
    expect(step('G', 'up')).toBeNull();
    expect(step('G/X/Y', 'down')).toBeNull();
    expect(step('G/S2', 'home')).toEqual({ type: 'move', index: 0 });
    expect(step('G/S2', 'end')).toEqual({ type: 'move', index: rows.length - 1 });
    expect(step('G', 'home')).toBeNull();
  });

  it('collapses or steps out with left, expands or steps in with right', () => {
    expect(step('G/S1', 'left')).toEqual({ type: 'collapse', key: 'G/S1' });
    expect(step('G/S1/SS/K', 'left')).toEqual({ type: 'move', index: indexOf('G/S1/SS') });
    expect(step('G/S1', 'right')).toEqual({ type: 'move', index: indexOf('G/S1/SS') });
    expect(step('G/S1/SS/K', 'right')).toBeNull();
    expect(step('G', 'left')).toEqual({ type: 'collapse', key: 'G' });

    const folded = flattenOutline(buildDescendantTree(g, 'G', { collapsed: new Set(['G/S1']) })!);
    expect(step('G/S1', 'right', folded)).toEqual({ type: 'expand', key: 'G/S1' });
    expect(step('G/S1', 'left', folded)).toEqual({ type: 'move', index: 0 });
    expect(outlineStep(folded, 99, 'down')).toBeNull();
  });

  it('writes numbers in Bangla digits', () => {
    expect(localNumber('1.12.3', 'bn')).toBe('১.১২.৩');
    expect(localNumber('1.12.3', 'en')).toBe('1.12.3');
  });

  it('reads key names', () => {
    expect(
      ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'x'].map(outlineKeyOf),
    ).toEqual(['up', 'down', 'left', 'right', 'home', 'end', null]);
  });
});
