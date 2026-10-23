import { walkDescendants, type DescNode } from '@/lib/domain/graph';

/** Above this many cards a tree opens with only the first generations shown (§13.1). */
export const AUTO_COLLAPSE_CARDS = 150;
export const DEFAULT_GENERATIONS = 3;

/** Cards a descendant tree draws: each person plus their partners. */
export function cardCount(root: DescNode): number {
  let count = 0;
  walkDescendants(root, (node) => {
    count += 1 + node.partners.length;
  });
  return count;
}

/**
 * Collapse keys that show `generations` generations: every person at the last shown
 * generation who has children (VIS-02 "Show N generations").
 */
export function collapseBeyond(root: DescNode, generations: number): string[] {
  const keys: string[] = [];
  walkDescendants(root, (node) => {
    if (node.depth === generations - 1 && node.children.length > 0) keys.push(node.key);
  });
  return keys;
}

/** The collapse state a tree starts with when this browser has none saved. */
export function initialCollapsed(fullTree: DescNode): string[] {
  return cardCount(fullTree) > AUTO_COLLAPSE_CARDS
    ? collapseBeyond(fullTree, DEFAULT_GENERATIONS)
    : [];
}
