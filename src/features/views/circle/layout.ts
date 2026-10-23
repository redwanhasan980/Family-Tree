import { branchOf, walkDescendants, type DescNode } from '@/lib/domain/graph';
import type { ID } from '@/lib/domain/types';

/**
 * The Circle view's geometry (CV-01..04, DESIGN §13.4): the focus person in the centre,
 * each generation a ring, each person an arc sized by the descendant "leaves" under
 * them, so everyone gets a visible slice. Pure: angles and radii only.
 *
 * Angles are radians clockwise from 12 o'clock, so the first branch starts at the top
 * and the reading order runs clockwise.
 */

export interface CircleMetrics {
  /** Radius of the centre disc (CV-07). */
  centre: number;
  /** Width of one ring. */
  ring: number;
  /** Space between rings. */
  gap: number;
  fontSize: number;
}

export const CIRCLE_COMFORTABLE: CircleMetrics = { centre: 64, ring: 72, gap: 2, fontSize: 12 };
export const CIRCLE_COMPACT: CircleMetrics = { centre: 52, ring: 56, gap: 2, fontSize: 11 };

export const TAU = Math.PI * 2;

export interface CircleArc {
  key: string;
  personId: ID;
  /** Ring number: 1 is next to the centre. */
  depth: number;
  a0: number;
  a1: number;
  r0: number;
  r1: number;
  /** Which of the focus person's children the arc descends from (colours). */
  branch: number | null;
  isRef: boolean;
  /** There are descendants beyond the outer ring (CV-04's outer tick). */
  more: boolean;
  parentKey: string | null;
}

export interface CircleLayout {
  /** The centre person's key. */
  rootKey: string;
  /** Depth first, so siblings follow each other clockwise. */
  arcs: CircleArc[];
  byKey: ReadonlyMap<string, CircleArc>;
  /** The first arc of each person. */
  firstOf: ReadonlyMap<ID, string>;
  /** Rings actually drawn (a shallow family draws fewer than the limit). */
  rings: number;
  radius: number;
  metrics: CircleMetrics;
}

/** Inner and outer radius of ring `depth`. */
export function ringRadii(depth: number, metrics: CircleMetrics): [number, number] {
  const r0 = metrics.centre + (depth - 1) * metrics.ring;
  return [r0, r0 + metrics.ring - metrics.gap];
}

/** Leaves under each node: a person without shown children counts one. */
function leafCounts(root: DescNode): Map<string, number> {
  const counts = new Map<string, number>();
  const visit = (node: DescNode): number => {
    const value =
      node.children.length === 0 ? 1 : node.children.reduce((sum, child) => sum + visit(child), 0);
    counts.set(node.key, value);
    return value;
  };
  visit(root);
  return counts;
}

/**
 * Lays out `root`'s descendants (built with `maxDepth` = the ring limit, so deeper people
 * are counted in `hiddenCount`, not drawn).
 */
export function layoutCircle(
  root: DescNode,
  metrics: CircleMetrics = CIRCLE_COMFORTABLE,
): CircleLayout {
  const counts = leafCounts(root);
  const branches = branchOf(root);
  const arcs: CircleArc[] = [];
  let rings = 0;
  const place = (node: DescNode, parent: DescNode | null, a0: number, a1: number) => {
    if (parent) {
      const [r0, r1] = ringRadii(node.depth, metrics);
      rings = Math.max(rings, node.depth);
      arcs.push({
        key: node.key,
        personId: node.personId,
        depth: node.depth,
        a0,
        a1,
        r0,
        r1,
        branch: branches.get(node.key) ?? null,
        isRef: node.isRef,
        more: !node.collapsed && node.hiddenCount > 0,
        parentKey: parent.key,
      });
    }
    const total = counts.get(node.key)!;
    let at = a0;
    for (const child of node.children) {
      const span = ((a1 - a0) * counts.get(child.key)!) / total;
      place(child, node, at, at + span);
      at += span;
    }
  };
  place(root, null, 0, TAU);
  const firstOf = new Map<ID, string>();
  walkDescendants(root, (node) => {
    if (!node.isRef && !firstOf.has(node.personId)) firstOf.set(node.personId, node.key);
  });
  return {
    rootKey: root.key,
    arcs,
    byKey: new Map(arcs.map((arc) => [arc.key, arc])),
    firstOf,
    rings,
    radius: rings === 0 ? metrics.centre : ringRadii(rings, metrics)[1],
    metrics,
  };
}

/** A point at `angle` (clockwise from 12 o'clock) and radius `r`. */
export function polar(angle: number, r: number): { x: number; y: number } {
  return { x: r * Math.sin(angle), y: -r * Math.cos(angle) };
}

export type LabelMode = 'tangential' | 'radial' | 'none';

/** Space kept between a label and the arc's edges. */
const LABEL_PAD = 6;

/**
 * How a name of `textWidth` fits its arc (CV-02): along the arc when the arc is long
 * enough, else outward along the radius when the ring is wide enough, else hidden (the
 * name shows on hover or tap).
 */
export function fitLabel(
  arc: Pick<CircleArc, 'a0' | 'a1' | 'r0' | 'r1'>,
  textWidth: number,
  fontSize: number,
): LabelMode {
  const mid = (arc.r0 + arc.r1) / 2;
  const length = (arc.a1 - arc.a0) * mid;
  const thickness = arc.r1 - arc.r0;
  if (length - LABEL_PAD * 2 >= textWidth && thickness >= fontSize + LABEL_PAD) {
    return 'tangential';
  }
  if (thickness - LABEL_PAD * 2 >= textWidth && length >= fontSize + 2) return 'radial';
  return 'none';
}

/** The arc reads upright from left to right when its middle is in the top half. */
export function isTopHalf(arc: Pick<CircleArc, 'a0' | 'a1'>): boolean {
  const mid = ((((arc.a0 + arc.a1) / 2) % TAU) + TAU) % TAU;
  return mid <= Math.PI / 2 || mid >= (3 * Math.PI) / 2;
}

/**
 * The path a tangential label follows: the arc's middle, drawn clockwise in the top
 * half and anticlockwise in the bottom half so the text is never upside down. The
 * baseline is shifted so the letters sit in the middle of the ring.
 */
export function labelPath(
  arc: Pick<CircleArc, 'a0' | 'a1' | 'r0' | 'r1'>,
  fontSize: number,
): string {
  const top = isTopHalf(arc);
  // Letters rise away from the baseline: outward on top, inward when flipped.
  const r = (arc.r0 + arc.r1) / 2 + (top ? -1 : 1) * fontSize * 0.35;
  // A full ring can't be one SVG arc; leave a hair of a gap.
  const a1 = arc.a1 - arc.a0 >= TAU - 1e-6 ? arc.a1 - 1e-3 : arc.a1;
  const [from, to] = top ? [arc.a0, a1] : [a1, arc.a0];
  const start = polar(from, r);
  const end = polar(to, r);
  const large = a1 - arc.a0 > Math.PI ? 1 : 0;
  const sweep = top ? 1 : 0;
  return `M${round(start.x)},${round(start.y)}A${round(r)},${round(r)} 0 ${large} ${sweep} ${round(end.x)},${round(end.y)}`;
}

/**
 * A radial label's placement: rotated along the arc's middle, reading outward on the
 * right half and inward on the left, so it is never upside down.
 */
export function radialLabel(arc: Pick<CircleArc, 'a0' | 'a1' | 'r0' | 'r1'>): {
  transform: string;
  x: number;
} {
  const mid = (arc.a0 + arc.a1) / 2;
  const degrees = (mid * 180) / Math.PI;
  const right = mid <= Math.PI;
  return right
    ? { transform: `rotate(${round(degrees - 90)})`, x: round(arc.r0 + LABEL_PAD) }
    : { transform: `rotate(${round(degrees + 90)})`, x: round(-(arc.r1 - LABEL_PAD)) };
}

/** What the view shows while zooming (CV-03): an angular window and a depth offset. */
export interface ZoomWindow {
  x0: number;
  x1: number;
  depth: number;
}

export const FULL_WINDOW: ZoomWindow = { x0: 0, x1: TAU, depth: 0 };

/**
 * An arc as it appears while zooming: the window's angles stretched to the full circle
 * and its depth moved to the centre. Null when it is outside the window or inside the
 * centre.
 */
export function projectArc(
  arc: CircleArc,
  window: ZoomWindow,
  metrics: CircleMetrics,
): Pick<CircleArc, 'a0' | 'a1' | 'r0' | 'r1'> | null {
  const span = window.x1 - window.x0;
  const scale = (a: number) => Math.min(TAU, Math.max(0, ((a - window.x0) / span) * TAU));
  const a0 = scale(arc.a0);
  const a1 = scale(arc.a1);
  const depth = arc.depth - window.depth;
  // An arc moving into the centre shrinks against the centre disc.
  const raw = metrics.centre + (depth - 1) * metrics.ring;
  const r0 = Math.max(raw, metrics.centre);
  const r1 = raw + metrics.ring - metrics.gap;
  if (a1 - a0 < 1e-4 || r1 - r0 < 1) return null;
  return { a0, a1, r0, r1 };
}

/** Steps between two windows, `t` from 0 to 1. */
export function mixWindows(from: ZoomWindow, to: ZoomWindow, t: number): ZoomWindow {
  const mix = (a: number, b: number) => a + (b - a) * t;
  return { x0: mix(from.x0, to.x0), x1: mix(from.x1, to.x1), depth: mix(from.depth, to.depth) };
}

/** The window that zooms into `arc` (its slice becomes the whole circle). */
export function windowOf(arc: CircleArc): ZoomWindow {
  return { x0: arc.a0, x1: arc.a1, depth: arc.depth };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Arrow-key moves in the circle (CV-03, keyboard): inward, outward, around the ring. */
export type CircleStep = 'in' | 'out' | 'previous' | 'next';

/**
 * Where a step from `key` (an arc, or the centre's `rootKey`) lands: the parent, the
 * first child, or the neighbour in the same ring, wrapping around. Null when there is
 * nowhere to go.
 */
export function circleStep(layout: CircleLayout, key: string, step: CircleStep): string | null {
  if (key === layout.rootKey) {
    return step === 'out' ? (layout.arcs.find((a) => a.depth === 1)?.key ?? null) : null;
  }
  const arc = layout.byKey.get(key);
  if (!arc) return null;
  switch (step) {
    case 'in':
      return arc.parentKey;
    case 'out':
      return layout.arcs.find((a) => a.parentKey === key)?.key ?? null;
    case 'previous':
    case 'next': {
      const ring = layout.arcs.filter((a) => a.depth === arc.depth);
      if (ring.length < 2) return null;
      const at = ring.indexOf(arc);
      const by = step === 'next' ? 1 : -1;
      return ring[(at + by + ring.length) % ring.length]!.key;
    }
    default:
      step satisfies never;
      return null;
  }
}

/** The step an arrow key means, or null. */
export function circleStepOf(key: string): CircleStep | null {
  switch (key) {
    case 'ArrowUp':
      return 'in';
    case 'ArrowDown':
      return 'out';
    case 'ArrowLeft':
      return 'previous';
    case 'ArrowRight':
      return 'next';
    default:
      return null;
  }
}
