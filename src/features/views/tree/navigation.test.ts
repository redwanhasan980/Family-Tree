import { describe, expect, it } from 'vitest';

import { testFamily } from '@/lib/domain/fixtures/testFamily';
import { buildDescendantTree, buildGraph } from '@/lib/domain/graph';

import { layoutTree, type TreeLayout } from './layout';
import { createNavigator, stepFor, type Step } from './navigation';

const { persons, relationships } = testFamily();
const tree = buildDescendantTree(buildGraph(persons, relationships), 'G')!;

function walker(layout: TreeLayout, orientation: 'vertical' | 'horizontal' = 'vertical') {
  const move = createNavigator(layout, orientation);
  return (key: string, step: Step) => {
    const card = layout.cards.find((c) => c.key === key)!;
    return move(card, step)?.key ?? null;
  };
}

describe('tree keyboard navigation (TV-09)', () => {
  it('maps arrows to steps for each direction', () => {
    expect(stepFor('ArrowUp', 'vertical')).toBe('parent');
    expect(stepFor('ArrowDown', 'vertical')).toBe('child');
    expect(stepFor('ArrowLeft', 'vertical')).toBe('prev');
    expect(stepFor('ArrowRight', 'vertical')).toBe('next');
    expect(stepFor('ArrowLeft', 'horizontal')).toBe('parent');
    expect(stepFor('ArrowRight', 'horizontal')).toBe('child');
    expect(stepFor('ArrowUp', 'horizontal')).toBe('prev');
    expect(stepFor('ArrowDown', 'horizontal')).toBe('next');
    expect(stepFor('Enter', 'vertical')).toBeNull();
  });

  it('moves to parents and children', () => {
    const go = walker(layoutTree(tree));
    expect(go('G/S1', 'parent')).toBe('G');
    // A wife goes up the same way as her husband.
    expect(go('G/S1+SW', 'parent')).toBe('G');
    expect(go('G', 'parent')).toBeNull();
    expect(go('G/S1', 'child')).toBe('G/S1/SS');
    expect(go('G/S1/SS/K', 'child')).toBeNull();
    // From the first wife, the nearest child is one of hers.
    expect(['G/S1', 'G/D1']).toContain(go('G+W1', 'child'));
    expect(go('G+W2', 'child')).toBe('G/S2');
  });

  it('moves along a generation, partners included', () => {
    const go = walker(layoutTree(tree));
    expect(go('G+W1', 'next')).toBe('G');
    expect(go('G', 'next')).toBe('G+W2');
    expect(go('G+W2', 'next')).toBeNull();
    expect(go('G+W1', 'prev')).toBeNull();
    expect(go('G/S1', 'next')).toBe('G/S1+SW');
  });

  it('works the same in a left-to-right tree', () => {
    const go = walker(layoutTree(tree, undefined, 'horizontal'), 'horizontal');
    expect(go('G/S1', 'parent')).toBe('G');
    expect(go('G', 'next')).toBe('G+W2');
    expect(go('G/S1', 'child')).toBe('G/S1/SS');
  });
});
