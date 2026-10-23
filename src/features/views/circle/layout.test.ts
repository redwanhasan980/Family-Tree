import { describe, expect, it } from 'vitest';

import { generateFamily } from '@/lib/domain/fixtures/generate';
import { testFamily } from '@/lib/domain/fixtures/testFamily';
import { buildDescendantTree, buildGraph } from '@/lib/domain/graph';

import {
  CIRCLE_COMFORTABLE,
  CIRCLE_COMPACT,
  circleStep,
  circleStepOf,
  FULL_WINDOW,
  fitLabel,
  isTopHalf,
  labelPath,
  layoutCircle,
  mixWindows,
  polar,
  projectArc,
  radialLabel,
  ringRadii,
  TAU,
  windowOf,
  type CircleArc,
} from './layout';

const { persons, relationships } = testFamily();
const g = buildGraph(persons, relationships);
const layout = layoutCircle(buildDescendantTree(g, 'G', { maxDepth: 5 })!);
const arc = (key: string) => layout.byKey.get(key)!;
const span = (a: CircleArc) => a.a1 - a.a0;
const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe('layoutCircle (CV-01)', () => {
  it('gives every person a slice sized by the leaves below them', () => {
    // G has four leaves: K (through S1), K again (through D1), A and Y.
    const ring1 = layout.arcs.filter((a) => a.depth === 1);
    expect(ring1.map((a) => a.personId)).toEqual(['S1', 'D1', 'S2', 'X']);
    close(
      ring1.reduce((sum, a) => sum + span(a), 0),
      TAU,
    );
    close(span(arc('G/S1')), TAU / 4);
    close(span(arc('G/D1')), TAU / 4);
    close(arc('G/S1').a0, 0);
    close(arc('G/X').a1, TAU);
  });

  it('nests children inside their parent, clockwise in order', () => {
    const parent = arc('G/S1');
    const child = arc('G/S1/SS');
    expect(child.a0).toBeGreaterThanOrEqual(parent.a0 - 1e-9);
    expect(child.a1).toBeLessThanOrEqual(parent.a1 + 1e-9);
    expect(child.parentKey).toBe('G/S1');
    expect(arc('G/D1').a0).toBeCloseTo(arc('G/S1').a1, 9);
  });

  it('puts each generation in its own ring', () => {
    const [r0, r1] = ringRadii(1, CIRCLE_COMFORTABLE);
    expect(arc('G/S1')).toMatchObject({ depth: 1, r0, r1 });
    expect(r0).toBe(CIRCLE_COMFORTABLE.centre);
    expect(r1 - r0).toBe(CIRCLE_COMFORTABLE.ring - CIRCLE_COMFORTABLE.gap);
    expect(arc('G/S1/SS/K').r0).toBe(ringRadii(3, CIRCLE_COMFORTABLE)[0]);
    expect(layout.rings).toBe(3);
    expect(layout.radius).toBe(ringRadii(3, CIRCLE_COMFORTABLE)[1]);
  });

  it('marks repeated people and colours by branch', () => {
    expect(arc('G/D1/DD/K')).toMatchObject({ isRef: true, branch: 1 });
    expect(arc('G/S1/SS/K')).toMatchObject({ isRef: false, branch: 0 });
    expect(layout.firstOf.get('K')).toBe('G/S1/SS/K');
  });

  it('marks arcs with descendants beyond the outer ring (CV-04)', () => {
    const shallow = layoutCircle(buildDescendantTree(g, 'G', { maxDepth: 2 })!, CIRCLE_COMPACT);
    expect(shallow.rings).toBe(2);
    expect(shallow.byKey.get('G/S1/SS')).toMatchObject({ more: true });
    expect(shallow.byKey.get('G/S2/A')).toMatchObject({ more: false });
    expect(shallow.byKey.has('G/S1/SS/K')).toBe(false);
  });

  it('draws only the centre for someone without children', () => {
    const alone = layoutCircle(buildDescendantTree(g, 'O')!);
    expect(alone).toMatchObject({ arcs: [], rings: 0, radius: CIRCLE_COMFORTABLE.centre });
  });

  it('keeps every arc inside its parent on a large family', () => {
    const big = generateFamily({ size: 500, seed: 7 });
    const bg = buildGraph(big.persons, big.relationships);
    const root = big.persons.find(
      (p) => !big.relationships.some((r) => r.type === 'parent' && r.childId === p.id),
    )!;
    const result = layoutCircle(buildDescendantTree(bg, root.id, { maxDepth: 8 })!);
    for (const a of result.arcs) {
      const parent = a.parentKey ? result.byKey.get(a.parentKey) : undefined;
      if (!parent) continue;
      expect(a.a0).toBeGreaterThanOrEqual(parent.a0 - 1e-9);
      expect(a.a1).toBeLessThanOrEqual(parent.a1 + 1e-9);
      expect(a.depth).toBe(parent.depth + 1);
    }
  });
});

describe('labels (CV-02)', () => {
  const wide = { a0: 0, a1: 1, r0: 100, r1: 170 };
  it('follows the arc when it fits, else runs outward, else hides', () => {
    expect(fitLabel(wide, 80, 12)).toBe('tangential');
    expect(fitLabel({ ...wide, a1: 0.3 }, 50, 12)).toBe('radial');
    expect(fitLabel({ ...wide, a1: 0.05 }, 50, 12)).toBe('none');
    expect(fitLabel({ ...wide, a1: 0.3 }, 90, 12)).toBe('none');
  });

  it('never reads upside down', () => {
    expect(isTopHalf({ a0: 0, a1: 0.5 })).toBe(true);
    expect(isTopHalf({ a0: 5.5, a1: 6 })).toBe(true);
    expect(isTopHalf({ a0: 2.5, a1: 3.5 })).toBe(false);
    // Top: clockwise (sweep 1); bottom: anticlockwise (sweep 0).
    expect(labelPath({ a0: 0, a1: 1, r0: 100, r1: 170 }, 12)).toMatch(/ 0 0 1 /);
    expect(labelPath({ a0: 2.5, a1: 3.5, r0: 100, r1: 170 }, 12)).toMatch(/ 0 0 0 /);
    // A full ring is drawn as almost a full circle, the long way round.
    expect(labelPath({ a0: 0, a1: TAU, r0: 64, r1: 134 }, 12)).toMatch(/ 0 1 0 /);
    expect(radialLabel({ a0: 1, a1: 1.2, r0: 100, r1: 170 })).toEqual({
      transform: `rotate(${Math.round(((1.1 * 180) / Math.PI - 90) * 100) / 100})`,
      x: 106,
    });
    expect(radialLabel({ a0: 4, a1: 4.2, r0: 100, r1: 170 }).x).toBe(-164);
  });

  it('places points clockwise from 12 o’clock', () => {
    const top = polar(0, 10);
    const right = polar(Math.PI / 2, 10);
    expect(top.x).toBeCloseTo(0);
    expect(top.y).toBeCloseTo(-10);
    expect(right.x).toBeCloseTo(10);
    expect(right.y).toBeCloseTo(0);
  });
});

describe('zooming (CV-03)', () => {
  const s1 = arc('G/S1');
  const m = CIRCLE_COMFORTABLE;

  it('stretches the chosen slice to the whole circle and moves it inward', () => {
    const into = windowOf(s1);
    expect(projectArc(s1, into, m)).toBeNull();
    const child = projectArc(arc('G/S1/SS'), into, m)!;
    close(child.a0, 0);
    close(child.a1, TAU);
    expect(child.r0).toBe(m.centre);
    expect(projectArc(arc('G/S2'), into, m)).toBeNull();
    expect(projectArc(s1, FULL_WINDOW, m)).toMatchObject({ a0: s1.a0, r0: s1.r0 });
  });

  it('shrinks an arc into the centre halfway through', () => {
    const half = mixWindows(FULL_WINDOW, windowOf(s1), 0.5);
    expect(half.depth).toBe(0.5);
    const shrinking = projectArc(s1, half, m)!;
    expect(shrinking.r0).toBe(m.centre);
    expect(shrinking.r1).toBeLessThan(s1.r1);
  });
});

describe('keyboard (CV-03)', () => {
  it('moves in, out and around the ring', () => {
    expect(circleStep(layout, 'G', 'out')).toBe('G/S1');
    expect(circleStep(layout, 'G', 'in')).toBeNull();
    expect(circleStep(layout, 'G/S1', 'in')).toBe('G');
    expect(circleStep(layout, 'G/S1', 'out')).toBe('G/S1/SS');
    expect(circleStep(layout, 'G/S2/A', 'out')).toBeNull();
    expect(circleStep(layout, 'G/S1', 'next')).toBe('G/D1');
    expect(circleStep(layout, 'G/S1', 'previous')).toBe('G/X');
    expect(circleStep(layout, 'G/X', 'next')).toBe('G/S1');
    expect(circleStep(layout, 'missing', 'next')).toBeNull();
    const single = layoutCircle(buildDescendantTree(g, 'S2')!);
    expect(circleStep(single, 'S2/A', 'next')).toBeNull();
  });

  it('reads arrow keys', () => {
    expect(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].map(circleStepOf)).toEqual([
      'in',
      'out',
      'previous',
      'next',
      null,
    ]);
  });
});
