import { parentLinksOf, type FamilyGraph } from './build';
import { MAX_DEPTH } from './descendants';

import type { ID, ParentKind } from '../types';

/** One person in a pedigree (ancestor) view (DESIGN §12.4). */
export interface AncNode {
  /** Unique path of person IDs from the start person upwards. */
  key: string;
  personId: ID;
  /** 0 = the start person, 1 = parents, 2 = grandparents … */
  depth: number;
  /** How this person is the parent of the node below; undefined for the start person. */
  kind?: ParentKind;
  /** Biological first, then father before mother. */
  parents: AncNode[];
  /** The ancestor already appears elsewhere (pedigree collapse after a cousin marriage). */
  isRef: boolean;
  /** More ancestors exist beyond the depth limit. */
  hasMore: boolean;
}

export function buildAncestorTree(
  g: FamilyGraph,
  personId: ID,
  { maxDepth = 6 } = {},
): AncNode | null {
  if (!g.persons.has(personId)) return null;
  const depthLimit = Math.min(maxDepth, MAX_DEPTH);
  const placed = new Set<ID>();

  const visit = (id: ID, key: string, depth: number, kind?: ParentKind): AncNode => {
    const base = { key, personId: id, depth, ...(kind && { kind }) };
    if (placed.has(id)) return { ...base, parents: [], isRef: true, hasMore: false };
    placed.add(id);
    const links = parentLinksOf(g, id);
    if (depth >= depthLimit)
      return { ...base, parents: [], isRef: false, hasMore: links.length > 0 };
    return {
      ...base,
      parents: links.map((link) =>
        visit(link.parentId, `${key}/${link.parentId}`, depth + 1, link.kind),
      ),
      isRef: false,
      hasMore: false,
    };
  };

  return visit(personId, personId, 0);
}

/** Everyone `personId` descends from (not including them). Cycle-safe. */
export function ancestorIds(g: FamilyGraph, personId: ID): Set<ID> {
  const seen = new Set<ID>();
  const queue = [personId];
  for (let i = 0; i < queue.length; i++) {
    for (const link of parentLinksOf(g, queue[i]!)) {
      if (!seen.has(link.parentId) && link.parentId !== personId) {
        seen.add(link.parentId);
        queue.push(link.parentId);
      }
    }
  }
  return seen;
}
