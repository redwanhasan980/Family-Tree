/** A tree's size, as the milestones see it. */
export interface TreeSize {
  people: number;
  generations: number;
}

/** Small celebrations as a tree grows (UX-04). */
export type Milestone = 'people10' | 'people50' | 'people100' | 'generations5';

const MILESTONES: readonly { id: Milestone; reached: (size: TreeSize) => boolean }[] = [
  { id: 'people100', reached: (size) => size.people >= 100 },
  { id: 'people50', reached: (size) => size.people >= 50 },
  { id: 'people10', reached: (size) => size.people >= 10 },
  { id: 'generations5', reached: (size) => size.generations >= 5 },
];

export function isMilestone(value: unknown): value is Milestone {
  return MILESTONES.some((milestone) => milestone.id === value);
}

/**
 * The milestone a change reached, if any: one it crossed (below before, reached after)
 * that wasn't celebrated already. Only the biggest one counts when a change crosses
 * several at once, such as a big import.
 */
export function reachedMilestone(
  before: TreeSize,
  after: TreeSize,
  celebrated: readonly Milestone[],
): Milestone | null {
  for (const { id, reached } of MILESTONES) {
    if (reached(after) && !reached(before) && !celebrated.includes(id)) return id;
  }
  return null;
}

/** The people count from which a guest's own additions invite them to sign up (AUTH-03). */
export const UPGRADE_AT_PEOPLE = 5;

/** Whether a change added people to a tree that now has at least five. */
export function invitesUpgrade(before: TreeSize, after: TreeSize): boolean {
  return after.people > before.people && after.people >= UPGRADE_AT_PEOPLE;
}

/**
 * Visits are counted once per day in a browser. Returns the count after a visit on `day`
 * (an ISO date such as "2026-10-24").
 */
export function countVisit(
  record: { count: number; last: string } | null,
  day: string,
): { count: number; last: string } {
  if (record === null) return { count: 1, last: day };
  if (record.last === day) return record;
  return { count: record.count + 1, last: day };
}

/** The visit on which a guest is invited to sign up (AUTH-03). */
export const UPGRADE_AT_VISIT = 3;
