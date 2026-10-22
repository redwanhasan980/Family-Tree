import { childLinksOf, type FamilyGraph } from './build';
import { getFamilies } from './families';

import type { ID, SpouseLinkId, SpouseStatus } from '../types';

export interface DescPartner {
  personId: ID;
  linkId?: SpouseLinkId;
  status?: SpouseStatus;
  /** The partner also descends from the focus person (for example a cousin marriage). */
  isAlsoBloodline: boolean;
}

/** One person's place in a descendant view (DESIGN §12.3). */
export interface DescNode {
  /** Unique path of person IDs from the focus: "root/child/grandchild". */
  key: string;
  personId: ID;
  /** 0 = the focus person. */
  depth: number;
  partners: DescPartner[];
  children: DescChild[];
  /** A repeated occurrence: drawn as a linked card that jumps to the first one (VIS-09). */
  isRef: boolean;
  collapsed: boolean;
  /** Distinct descendants hidden by collapsing or the depth limit (VIS-02 badge). */
  hiddenCount: number;
}

export interface DescChild extends DescNode {
  /** The other parent this child is shown under; null when unknown. */
  viaPartnerId: ID | null;
}

export interface DescendantOptions {
  /** Path keys of collapsed nodes. Keys, not person IDs, so one occurrence collapses alone. */
  collapsed?: ReadonlySet<string>;
  /** Deepest depth that still shows children; deeper ones are hidden and counted. */
  maxDepth?: number;
}

/** Everyone who descends from `personId` (not including them). Cycle-safe. */
export function descendantIds(g: FamilyGraph, personId: ID): Set<ID> {
  const seen = new Set<ID>();
  const queue = [personId];
  for (let i = 0; i < queue.length; i++) {
    for (const link of childLinksOf(g, queue[i]!)) {
      if (!seen.has(link.childId) && link.childId !== personId) {
        seen.add(link.childId);
        queue.push(link.childId);
      }
    }
  }
  return seen;
}

/**
 * Real families stay far below this; it only stops a corrupt or hostile chain of
 * thousands of generations from overflowing the stack. Deeper people are counted.
 */
export const MAX_DEPTH = 300;

const counts = new WeakMap<FamilyGraph, Map<ID, number>>();

/** Number of distinct descendants; shared descendants count once. Memoized per graph. */
export function countDescendants(g: FamilyGraph, personId: ID): number {
  let memo = counts.get(g);
  if (!memo) {
    memo = new Map();
    counts.set(g, memo);
  }
  let count = memo.get(personId);
  if (count === undefined) {
    count = descendantIds(g, personId).size;
    memo.set(personId, count);
  }
  return count;
}

/**
 * The descendant hierarchy below `focusId`, depth-first in family and sibling order.
 * The first occurrence of a person is the primary one; later occurrences (cousin
 * marriages, a child linked to two bloodline parents) are reference nodes without
 * children. Returns null when the focus person doesn't exist.
 */
export function buildDescendantTree(
  g: FamilyGraph,
  focusId: ID,
  { collapsed = new Set(), maxDepth = Infinity }: DescendantOptions = {},
): DescNode | null {
  if (!g.persons.has(focusId)) return null;
  const depthLimit = Math.min(maxDepth, MAX_DEPTH);
  const bloodline = descendantIds(g, focusId);
  bloodline.add(focusId);
  const placed = new Set<ID>();

  const visit = (personId: ID, key: string, depth: number): DescNode => {
    if (placed.has(personId)) {
      return {
        key,
        personId,
        depth,
        partners: [],
        children: [],
        isRef: true,
        collapsed: false,
        hiddenCount: 0,
      };
    }
    placed.add(personId);
    const families = getFamilies(g, personId);
    const partners: DescPartner[] = families.flatMap((f) =>
      f.partnerId === null
        ? []
        : [
            {
              personId: f.partnerId,
              ...(f.spouseLink && { linkId: f.spouseLink.id, status: f.spouseLink.status }),
              isAlsoBloodline: bloodline.has(f.partnerId),
            },
          ],
    );
    const isCollapsed = collapsed.has(key);
    if (isCollapsed || depth >= depthLimit) {
      return {
        key,
        personId,
        depth,
        partners,
        children: [],
        isRef: false,
        collapsed: isCollapsed,
        hiddenCount: countDescendants(g, personId),
      };
    }
    const children: DescChild[] = families.flatMap((family) =>
      family.childIds.map((childId) => ({
        ...visit(childId, `${key}/${childId}`, depth + 1),
        viaPartnerId: family.partnerId,
      })),
    );
    return {
      key,
      personId,
      depth,
      partners,
      children,
      isRef: false,
      collapsed: false,
      hiddenCount: 0,
    };
  };

  return visit(focusId, focusId, 0);
}

/** Calls `fn` for every node, parents before children. */
export function walkDescendants(
  root: DescNode,
  fn: (node: DescNode, parent: DescNode | null) => void,
): void {
  const stack: [DescNode, DescNode | null][] = [[root, null]];
  while (stack.length > 0) {
    const [node, parent] = stack.pop()!;
    fn(node, parent);
    for (let i = node.children.length - 1; i >= 0; i--) stack.push([node.children[i]!, node]);
  }
}
