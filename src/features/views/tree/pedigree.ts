import type { AncNode } from '@/lib/domain/graph';
import type { ID } from '@/lib/domain/types';

import {
  COMFORTABLE,
  type Bounds,
  type LaidCard,
  type LaidLine,
  type TreeLayout,
  type TreeMetrics,
} from './layout';

/**
 * The pedigree (TV-06, DESIGN §13.6): a person on the left and their ancestors to the
 * right, a column per generation, father above mother. It returns the Tree view's layout
 * shape, so cards, connectors, the camera and keyboard moves work as in the family tree.
 * Keys follow the ancestor tree (`me/father/grandfather`), so the navigator's "child"
 * step goes to the parents, to the right on screen.
 */

export interface PedigreeLayout extends TreeLayout {
  /** Card keys of people with more ancestors beyond the last column. */
  more: ReadonlySet<string>;
}

export function layoutPedigree(root: AncNode, metrics: TreeMetrics = COMFORTABLE): PedigreeLayout {
  const cards: LaidCard[] = [];
  const lines: LaidLine[] = [];
  const more = new Set<string>();
  const columnStep = metrics.cardW + metrics.levelGap;
  const rowStep = metrics.cardH + metrics.siblingGap;
  let nextSlot = 0;

  // Returns the card's vertical centre. Leaves take the next free row; others sit midway
  // between their first and last parent.
  const place = (node: AncNode): number => {
    const parents = node.isRef ? [] : node.parents;
    const centres = parents.map(place);
    const centre =
      centres.length === 0
        ? nextSlot++ * rowStep + metrics.cardH / 2
        : (centres[0]! + centres[centres.length - 1]!) / 2;
    const x = node.depth * columnStep;
    cards.push({
      key: node.key,
      nodeKey: node.key,
      personId: node.personId,
      role: 'person',
      x,
      y: centre - metrics.cardH / 2,
      w: metrics.cardW,
      h: metrics.cardH,
      depth: node.depth,
      isRef: node.isRef,
      isAlsoBloodline: false,
    });
    if (node.hasMore) more.add(node.key);
    const fromX = x + metrics.cardW;
    const midX = fromX + metrics.levelGap / 2;
    parents.forEach((parent, i) => {
      const toX = (node.depth + 1) * columnStep;
      lines.push({
        key: `${node.key}>${parent.personId}`,
        kind: 'descent',
        d: `M${fromX},${centre}H${midX}V${centres[i]!}H${toX}`,
        dashed: parent.kind !== undefined && parent.kind !== 'biological',
      });
    });
    return centre;
  };
  place(root);

  // Parents before children in drawing order doesn't matter; keep the person first.
  cards.reverse();
  const bounds: Bounds = cards.reduce(
    (b, c) => ({
      minX: Math.min(b.minX, c.x),
      minY: Math.min(b.minY, c.y),
      maxX: Math.max(b.maxX, c.x + c.w),
      maxY: Math.max(b.maxY, c.y + c.h),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
  const cardsOf = new Map<ID, string[]>();
  for (const card of [...cards].sort((a, b) => a.depth - b.depth)) {
    const keys = cardsOf.get(card.personId);
    // The full card comes before repeated ones (VIS-09).
    if (!keys) cardsOf.set(card.personId, [card.key]);
    else if (card.isRef) keys.push(card.key);
    else keys.unshift(card.key);
  }
  return { cards, lines, bounds, cardsOf, more };
}
