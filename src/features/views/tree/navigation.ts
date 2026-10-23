import type { LaidCard, Orientation, TreeLayout } from './layout';

/** A move between cards: up to the parents, down to the children, or along a generation. */
export type Step = 'parent' | 'child' | 'prev' | 'next';

/** Arrow keys move on screen, so what they mean follows the tree's direction (TV-09). */
export function stepFor(key: string, orientation: Orientation): Step | null {
  const vertical = orientation === 'vertical';
  switch (key) {
    case 'ArrowUp':
      return vertical ? 'parent' : 'prev';
    case 'ArrowDown':
      return vertical ? 'child' : 'next';
    case 'ArrowLeft':
      return vertical ? 'prev' : 'parent';
    case 'ArrowRight':
      return vertical ? 'next' : 'child';
    default:
      return null;
  }
}

const parentKey = (nodeKey: string) => {
  const slash = nodeKey.lastIndexOf('/');
  return slash < 0 ? null : nodeKey.slice(0, slash);
};

/**
 * Keyboard movement over a laid-out tree (TV-09). Up from anyone in a family unit goes
 * to the parent's card; down goes to the nearest child; along a generation goes to the
 * next card in that row, husbands, wives and cousins included.
 */
export function createNavigator(layout: TreeLayout, orientation: Orientation) {
  const vertical = orientation === 'vertical';
  const centre = (card: LaidCard) => (vertical ? card.x + card.w / 2 : card.y + card.h / 2);
  const byKey = new Map(layout.cards.map((card) => [card.key, card]));
  const rows = new Map<number, LaidCard[]>();
  const children = new Map<string, LaidCard[]>();
  for (const card of layout.cards) {
    const row = rows.get(card.depth);
    if (row) row.push(card);
    else rows.set(card.depth, [card]);
    const parent = card.role === 'person' ? parentKey(card.nodeKey) : null;
    if (parent !== null) {
      const list = children.get(parent);
      if (list) list.push(card);
      else children.set(parent, [card]);
    }
  }
  for (const row of rows.values()) row.sort((a, b) => centre(a) - centre(b));

  return (card: LaidCard, step: Step): LaidCard | null => {
    switch (step) {
      case 'parent': {
        const parent = parentKey(card.nodeKey);
        return parent === null ? null : (byKey.get(parent) ?? null);
      }
      case 'child': {
        const below = children.get(card.nodeKey) ?? [];
        let best: LaidCard | null = null;
        for (const child of below) {
          if (
            !best ||
            Math.abs(centre(child) - centre(card)) < Math.abs(centre(best) - centre(card))
          )
            best = child;
        }
        return best;
      }
      case 'prev':
      case 'next': {
        const row = rows.get(card.depth) ?? [];
        const index = row.findIndex((c) => c.key === card.key);
        return row[index + (step === 'next' ? 1 : -1)] ?? null;
      }
    }
  };
}
