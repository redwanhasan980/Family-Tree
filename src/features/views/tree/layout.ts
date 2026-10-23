import { flextree, type FlexNode } from 'd3-flextree';

import type { DescChild, DescNode, DescPartner } from '@/lib/domain/graph';
import type { ID } from '@/lib/domain/types';

import { orthogonalPath, type Point } from '../shared/paths';

/**
 * Tree view layout (TV-01/02, DESIGN §13.3). A pure function: descendant hierarchy in,
 * card boxes and connector paths out. Each person and their partners form one *family
 * unit*; d3-flextree places the units as a tidy tree with variable widths.
 *
 * The layout works on two axes: *breadth* (where siblings spread) and *depth* (where
 * generations go). Vertical trees map them to x/y; horizontal trees swap them.
 */

export type Orientation = 'vertical' | 'horizontal';

export interface TreeMetrics {
  cardW: number;
  cardH: number;
  /** Between a person and a partner (the marriage line runs through it). */
  spouseGap: number;
  /** Between generations (the connector bus runs halfway). */
  levelGap: number;
  /** Between units with the same parent, and between other neighbours. */
  siblingGap: number;
  cousinGap: number;
}

/** Desktop cards (VIS-05). */
export const COMFORTABLE: TreeMetrics = {
  cardW: 176,
  cardH: 76,
  spouseGap: 28,
  levelGap: 64,
  siblingGap: 24,
  cousinGap: 48,
};

/** Phone cards. */
export const COMPACT: TreeMetrics = {
  cardW: 136,
  cardH: 64,
  spouseGap: 20,
  levelGap: 56,
  siblingGap: 16,
  cousinGap: 32,
};

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** The expand/collapse control of a person card, centred at (x, y). */
export interface CardToggle {
  collapsed: boolean;
  /** Descendants hidden behind it ("+N"). */
  hiddenCount: number;
  x: number;
  y: number;
}

export interface LaidCard {
  /** The node key for a person card; `${nodeKey}+${partnerId}` for a partner card. */
  key: string;
  nodeKey: string;
  personId: ID;
  role: 'person' | 'partner';
  /** Top-left corner. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Generation below the focus person (0 = focus); partners share their partner's. */
  depth: number;
  /** A repeated person drawn as a link to their full card (VIS-09). */
  isRef: boolean;
  /** A partner who also descends from the focus person (VIS-08 link badge). */
  isAlsoBloodline: boolean;
  toggle?: CardToggle;
}

export interface LaidLine {
  key: string;
  kind: 'marriage' | 'descent';
  d: string;
  /** Divorced or separated couples, and parents without a marriage record. */
  dashed: boolean;
  /** Where the ring sits on a marriage line (married couples only). */
  ring?: Point;
}

export interface TreeLayout {
  cards: LaidCard[];
  lines: LaidLine[];
  bounds: Bounds;
  /** Card keys of every occurrence of a person, primary first. */
  cardsOf: Map<ID, string[]>;
}

interface Unit {
  node: DescNode;
  /** Cards along the breadth axis: the person's index and each partner's. */
  order: ({ kind: 'person' } | { kind: 'partner'; partner: DescPartner })[];
}

/** One partner: [person][partner]; two: [p1][person][p2]; more: person first (§13.3). */
function unitOf(node: DescNode): Unit {
  const partners = node.isRef ? [] : node.partners;
  const person = { kind: 'person' as const };
  const cards = partners.map((partner) => ({ kind: 'partner' as const, partner }));
  if (cards.length === 2) return { node, order: [cards[0]!, person, cards[1]!] };
  return { node, order: [person, ...cards] };
}

const DASHED_STATUSES = new Set(['divorced', 'separated']);

export function layoutTree(
  root: DescNode,
  metrics: TreeMetrics = COMFORTABLE,
  orientation: Orientation = 'vertical',
): TreeLayout {
  const vertical = orientation === 'vertical';
  // Card size along each axis.
  const cardB = vertical ? metrics.cardW : metrics.cardH;
  const cardD = vertical ? metrics.cardH : metrics.cardW;
  const gap = metrics.spouseGap;
  const toXY = ([b, d]: Point): Point => (vertical ? [b, d] : [d, b]);

  const units = new Map<string, Unit>();
  const unitFor = (node: DescNode) => {
    let unit = units.get(node.key);
    if (!unit) {
      unit = unitOf(node);
      units.set(node.key, unit);
    }
    return unit;
  };
  const breadthOf = (unit: Unit) => unit.order.length * cardB + (unit.order.length - 1) * gap;

  const layout = flextree<DescNode>({
    children: (node) => (node.children.length > 0 ? node.children : undefined),
    nodeSize: (n) => [breadthOf(unitFor(n.data)), cardD + metrics.levelGap],
    spacing: (a, b) => (a.parent === b.parent ? metrics.siblingGap : metrics.cousinGap),
  });
  const laid = layout(layout.hierarchy(root, (node) => node.children));

  const cards: LaidCard[] = [];
  const lines: LaidLine[] = [];
  const cardsOf = new Map<ID, string[]>();

  // Where a unit starts, and where its person card starts, on the breadth axis.
  const unitStart = (flex: FlexNode<DescNode>) => flex.x - breadthOf(unitFor(flex.data)) / 2;
  const personStartOf = (flex: FlexNode<DescNode>) => {
    const index = unitFor(flex.data).order.findIndex((c) => c.kind === 'person');
    return unitStart(flex) + index * (cardB + gap);
  };

  const addCard = (card: LaidCard) => {
    cards.push(card);
    const keys = cardsOf.get(card.personId);
    if (keys) keys.push(card.key);
    else cardsOf.set(card.personId, [card.key]);
  };

  laid.each((flex: FlexNode<DescNode>) => {
    const unit = unitFor(flex.data);
    const { node } = unit;
    const left = unitStart(flex);
    const top = flex.y;
    const startOf = (index: number) => left + index * (cardB + gap);
    const personIndex = unit.order.findIndex((c) => c.kind === 'person');
    const personB = startOf(personIndex);

    unit.order.forEach((slot, index) => {
      const [x, y] = toXY([startOf(index), top]);
      const box = { x, y, w: metrics.cardW, h: metrics.cardH, depth: node.depth };
      if (slot.kind === 'person') {
        const expandable = !node.isRef && (node.children.length > 0 || node.hiddenCount > 0);
        const [tx, ty] = toXY([personB + cardB / 2, top + cardD]);
        addCard({
          ...box,
          key: node.key,
          nodeKey: node.key,
          personId: node.personId,
          role: 'person',
          isRef: node.isRef,
          isAlsoBloodline: false,
          ...(expandable && {
            toggle: {
              collapsed: node.children.length === 0,
              hiddenCount: node.hiddenCount,
              x: tx,
              y: ty,
            },
          }),
        });
      } else {
        addCard({
          ...box,
          key: `${node.key}+${slot.partner.personId}`,
          nodeKey: node.key,
          personId: slot.partner.personId,
          role: 'partner',
          isRef: false,
          isAlsoBloodline: slot.partner.isAlsoBloodline,
        });
      }
    });

    // Marriage lines, and where each couple's children hang from.
    const midD = top + cardD / 2;
    const dropFrom = new Map<ID | null, Point>();
    unit.order.forEach((slot, index) => {
      if (slot.kind !== 'partner') return;
      const { partner } = slot;
      const toRight = index > personIndex;
      // Partners further out run slightly lower, so the lines stay apart.
      const offset = (Math.abs(index - personIndex) - 1) * 6;
      const from: Point = [toRight ? personB + cardB : personB, midD + offset];
      const to: Point = [toRight ? startOf(index) : startOf(index) + cardB, midD + offset];
      // The gap next to the partner, on the person's side.
      const gapMid = toRight ? startOf(index) - gap / 2 : startOf(index) + cardB + gap / 2;
      const married = partner.linkId !== undefined;
      dropFrom.set(partner.personId, [gapMid, midD + offset]);
      lines.push({
        key: `m:${node.key}+${partner.personId}`,
        kind: 'marriage',
        d: orthogonalPath([from, to].map(toXY)),
        dashed: !married || DASHED_STATUSES.has(partner.status ?? ''),
        ...(married && { ring: toXY([gapMid, midD + offset]) }),
      });
    });

    // One connector path per family: down to a bus halfway, then to each child.
    const busD = top + cardD + metrics.levelGap / 2;
    const families = new Map<ID | null, FlexNode<DescNode>[]>();
    for (const child of flex.children ?? []) {
      const viaPartner = (child.data as DescChild).viaPartnerId;
      const via = dropFrom.has(viaPartner) ? viaPartner : null;
      const list = families.get(via);
      if (list) list.push(child);
      else families.set(via, [child]);
    }
    for (const [via, children] of families) {
      const start: Point = dropFrom.get(via) ?? [personB + cardB / 2, top + cardD];
      const d = children
        .map((child) => {
          const childB = personStartOf(child) + cardB / 2;
          const route: Point[] = [start, [start[0], busD], [childB, busD], [childB, child.y]];
          return orthogonalPath(route.map(toXY));
        })
        .join(' ');
      lines.push({ key: `d:${node.key}:${via ?? '-'}`, kind: 'descent', d, dashed: false });
    }
  });

  return { cards, lines, bounds: boundsOf(cards), cardsOf };
}

function boundsOf(cards: readonly LaidCard[]): Bounds {
  if (cards.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const card of cards) {
    minX = Math.min(minX, card.x);
    minY = Math.min(minY, card.y);
    maxX = Math.max(maxX, card.x + card.w);
    maxY = Math.max(maxY, card.y + card.h);
    if (card.toggle) {
      maxX = Math.max(maxX, card.toggle.x + 16);
      maxY = Math.max(maxY, card.toggle.y + 16);
    }
  }
  return { minX, minY, maxX, maxY };
}
