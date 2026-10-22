import type { ID, ParentLinkId, SpouseLinkId } from './types';

/**
 * Relationship document IDs are deterministic, so the same pair of people always maps to
 * the same document and duplicates are impossible (DESIGN §7.3). Build them only here.
 */

/** Firestore auto IDs: 20 ASCII letters and digits. Import keeps IDs in the same form. */
const ID_PATTERN = /^[A-Za-z0-9]{1,40}$/;

export function isValidId(id: string): boolean {
  return ID_PATTERN.test(id);
}

function assertId(id: ID): void {
  if (!isValidId(id)) throw new Error(`Invalid document ID: ${JSON.stringify(id)}`);
}

export function parentLinkId(parentId: ID, childId: ID): ParentLinkId {
  assertId(parentId);
  assertId(childId);
  return `p_${parentId}_${childId}`;
}

/** The two IDs in ascending order, as stored in `personIds`. */
export function spousePair(a: ID, b: ID): [ID, ID] {
  assertId(a);
  assertId(b);
  return a < b ? [a, b] : [b, a];
}

export function spouseLinkId(a: ID, b: ID): SpouseLinkId {
  const [min, max] = spousePair(a, b);
  return `s_${min}_${max}`;
}

/** Reads a relationship ID back into its parts, or null when it is malformed. */
export function parseLinkId(
  id: string,
): { type: 'parent'; parentId: ID; childId: ID } | { type: 'spouse'; personIds: [ID, ID] } | null {
  const match = /^([ps])_([A-Za-z0-9]{1,40})_([A-Za-z0-9]{1,40})$/.exec(id);
  if (!match) return null;
  const [, kind, a = '', b = ''] = match;
  if (kind === 'p') return { type: 'parent', parentId: a, childId: b };
  return a < b ? { type: 'spouse', personIds: [a, b] } : null;
}
