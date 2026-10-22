import { childLinksOf, parentLinksOf, partnerIn, spouseLinksOf, type FamilyGraph } from './build';
import { compareSpouseLinks, parentKindRank } from './order';

import type { ID, ParentLink, SpouseLink } from '../types';

/** One couple (or a single parent) and the children they share. Derived, never stored. */
export interface Family {
  /** The other parent, or null when unknown. */
  partnerId: ID | null;
  /** Missing for co-parents without a marriage record. */
  spouseLink?: SpouseLink;
  /** In sibling order. */
  childIds: ID[];
}

/**
 * The other parent a child is shown under, from `personId`'s point of view. With several
 * candidates (for example a biological mother and a stepmother) the closest kind of link
 * wins, then a spouse of `personId`, then the lowest ID.
 */
export function otherParentOf(g: FamilyGraph, personId: ID, childId: ID): ID | null {
  const spouses = new Set(spouseLinksOf(g, personId).map((l) => partnerIn(l, personId)));
  let best: ParentLink | null = null;
  for (const link of parentLinksOf(g, childId)) {
    if (link.parentId === personId) continue;
    if (
      !best ||
      parentKindRank(link.kind) < parentKindRank(best.kind) ||
      (parentKindRank(link.kind) === parentKindRank(best.kind) &&
        spouses.has(link.parentId) &&
        !spouses.has(best.parentId))
    ) {
      best = link;
    }
  }
  return best?.parentId ?? null;
}

/**
 * A person's families (DESIGN §12.2): spouses in marriage order (with or without
 * children), then co-parents who are not spouses in order of their first child, then
 * children whose other parent is unknown.
 */
export function getFamilies(g: FamilyGraph, personId: ID): Family[] {
  const bySpouse = new Map<ID, Family>();
  for (const link of [...spouseLinksOf(g, personId)].sort(compareSpouseLinks)) {
    bySpouse.set(partnerIn(link, personId), {
      partnerId: partnerIn(link, personId),
      spouseLink: link,
      childIds: [],
    });
  }
  const coParents = new Map<ID, Family>();
  const unknown: Family = { partnerId: null, childIds: [] };

  for (const link of childLinksOf(g, personId)) {
    const other = otherParentOf(g, personId, link.childId);
    if (other === null) {
      unknown.childIds.push(link.childId);
      continue;
    }
    const family = bySpouse.get(other) ?? coParents.get(other);
    if (family) family.childIds.push(link.childId);
    else coParents.set(other, { partnerId: other, childIds: [link.childId] });
  }

  const families = [...bySpouse.values(), ...coParents.values()];
  if (unknown.childIds.length > 0) families.push(unknown);
  return families;
}

/** Everyone a person has children with or is married to, in family order. */
export function partnersOf(g: FamilyGraph, personId: ID): ID[] {
  return getFamilies(g, personId).flatMap((f) => (f.partnerId ? [f.partnerId] : []));
}

/** Children of `personId`, optionally only those shared with `partnerId` (null = unknown). */
export function childrenOf(g: FamilyGraph, personId: ID, partnerId?: ID | null): ID[] {
  if (partnerId === undefined) return childLinksOf(g, personId).map((l) => l.childId);
  return getFamilies(g, personId).find((f) => f.partnerId === partnerId)?.childIds ?? [];
}

/** Parents of a person, biological first, father before mother. */
export function parentsOf(g: FamilyGraph, personId: ID): ID[] {
  return parentLinksOf(g, personId).map((l) => l.parentId);
}

/** Brothers and sisters: anyone who shares at least one parent (half-siblings included). */
export function siblingsOf(g: FamilyGraph, personId: ID): ID[] {
  const seen = new Set<ID>([personId]);
  const result: ID[] = [];
  for (const parent of parentsOf(g, personId)) {
    for (const link of childLinksOf(g, parent)) {
      if (!seen.has(link.childId)) {
        seen.add(link.childId);
        result.push(link.childId);
      }
    }
  }
  return result;
}
