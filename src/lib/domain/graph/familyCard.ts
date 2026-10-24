import { parentLinksOf, partnerIn, spouseLinksOf, type FamilyGraph } from './build';
import { childrenOf, getFamilies, siblingsOf } from './families';
import { sortSiblings } from './order';

import type { ID, ParentKind, SpouseLink } from '../types';

/** A parent who isn't the biological father or mother (FC-01: a third chip). */
export interface FamilyCardParent {
  personId: ID;
  kind: ParentKind;
}

/** One of the focus person's families: a husband or wife (or an unknown other parent). */
export interface FamilyCardPartner {
  /** Null when the children's other parent is unknown. */
  personId: ID | null;
  link?: SpouseLink;
  childIds: ID[];
}

/** Everything the Family card shows for one person (FC-01..07, DESIGN §13.7). */
export interface FamilyCardModel {
  focusId: ID;
  fatherId: ID | null;
  motherId: ID | null;
  otherParents: FamilyCardParent[];
  /** The parents' marriage, if recorded. */
  parentsLink: SpouseLink | null;
  /** In family order (§12.2): spouses by marriage order, then co-parents, then unknown. */
  partners: FamilyCardPartner[];
  /** The focus person and their brothers and sisters, in sibling order (FC-07). */
  siblingIds: ID[];
  /** From the tree's start down to the focus person; empty when not connected (FC-02). */
  trail: ID[];
  /** How many children each child has ("3 children ›", FC-05). */
  childCounts: ReadonlyMap<ID, number>;
}

/**
 * The way from `rootId` down to `personId` through parents, the shortest one, the
 * father's line first when two are as short. Empty when the root isn't an ancestor.
 */
export function trailTo(g: FamilyGraph, rootId: ID, personId: ID): ID[] {
  if (!g.persons.has(personId) || !g.persons.has(rootId)) return [];
  if (rootId === personId) return [personId];
  // childOf[parent] = the child we came up from.
  const childOf = new Map<ID, ID>();
  const queue = [personId];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]!;
    for (const link of parentLinksOf(g, id)) {
      if (childOf.has(link.parentId) || link.parentId === personId) continue;
      childOf.set(link.parentId, id);
      if (link.parentId === rootId) {
        const trail = [rootId];
        let at = rootId;
        while (at !== personId) {
          at = childOf.get(at)!;
          trail.push(at);
        }
        return trail;
      }
      queue.push(link.parentId);
    }
  }
  return [];
}

export function buildFamilyCard(
  g: FamilyGraph,
  focusId: ID,
  rootId: ID | null = null,
): FamilyCardModel | null {
  if (!g.persons.has(focusId)) return null;

  let fatherId: ID | null = null;
  let motherId: ID | null = null;
  const otherParents: FamilyCardParent[] = [];
  for (const link of parentLinksOf(g, focusId)) {
    const gender = g.persons.get(link.parentId)?.gender;
    if (link.kind === 'biological' && gender === 'male' && !fatherId) fatherId = link.parentId;
    else if (link.kind === 'biological' && gender === 'female' && !motherId) {
      motherId = link.parentId;
    } else otherParents.push({ personId: link.parentId, kind: link.kind });
  }
  const parentsLink =
    fatherId && motherId
      ? (spouseLinksOf(g, fatherId).find((l) => partnerIn(l, fatherId!) === motherId) ?? null)
      : null;

  const partners = getFamilies(g, focusId).map((family) => ({
    personId: family.partnerId,
    ...(family.spouseLink && { link: family.spouseLink }),
    childIds: family.childIds,
  }));

  const siblings = [focusId, ...siblingsOf(g, focusId)].flatMap((id) => g.persons.get(id) ?? []);
  const childCounts = new Map<ID, number>();
  for (const partner of partners) {
    for (const childId of partner.childIds) {
      childCounts.set(childId, childrenOf(g, childId).length);
    }
  }

  return {
    focusId,
    fatherId,
    motherId,
    otherParents,
    parentsLink,
    partners,
    siblingIds: sortSiblings(siblings).map((p) => p.id),
    trail: rootId ? trailTo(g, rootId, focusId) : [],
    childCounts,
  };
}
