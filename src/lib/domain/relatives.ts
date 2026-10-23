import { parentLinksOf, partnersOf, type FamilyGraph } from './graph';

import type { Gender, ID } from './types';

/**
 * Gender-aware words and sensible defaults for adding relatives (REL-02, REL-12). The
 * UI always shows the choice; these only pick what is already selected.
 */

export type SpouseRelation = 'wife' | 'husband' | 'other';

/** What a new spouse of this person is called. */
export function spouseRelation(gender: Gender): SpouseRelation {
  if (gender === 'male') return 'wife';
  if (gender === 'female') return 'husband';
  return 'other';
}

/** A new spouse's likely gender: the opposite one, or no guess. */
export function likelySpouseGender(gender: Gender): 'male' | 'female' | null {
  if (gender === 'male') return 'female';
  if (gender === 'female') return 'male';
  return null;
}

/** The parent still missing: a mother when there's a biological father, and so on. */
export function missingParentGender(g: FamilyGraph, childId: ID): 'male' | 'female' | null {
  const genders = parentLinksOf(g, childId)
    .filter((link) => link.kind === 'biological')
    .map((link) => g.persons.get(link.parentId)?.gender);
  if (genders.includes('male') && !genders.includes('female')) return 'female';
  if (genders.includes('female') && !genders.includes('male')) return 'male';
  return null;
}

/** Who a new child's other parent can be: the person's spouses and co-parents. */
export function otherParentChoices(g: FamilyGraph, personId: ID): ID[] {
  return partnersOf(g, personId);
}
