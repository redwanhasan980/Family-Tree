import { walkDescendants, type DescNode } from '@/lib/domain/graph';
import type { ID } from '@/lib/domain/types';

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

/**
 * The collapse keys to open so a person shows (VIS-04): the ancestors of the first place
 * they appear in the full tree, as themselves or beside a husband or wife. Null when the
 * tree doesn't show them at all.
 */
export function keysToReveal(fullTree: DescNode, personId: ID): string[] | null {
  let found: DescNode | null = null;
  walkDescendants(fullTree, (node) => {
    if (found) return;
    const here = node.personId === personId && !node.isRef;
    if (here || node.partners.some((p) => p.personId === personId)) found = node;
  });
  if (!found) return null;
  const parts = (found as DescNode).key.split('/');
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('/'));
}
