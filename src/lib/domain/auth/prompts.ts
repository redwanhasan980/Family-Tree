/** Guest upgrade prompts (AUTH-03): each prompt can be dismissed for a while. */
export const PROMPT_SNOOZE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export function isSnoozed(
  dismissedAt: number | null,
  now: number,
  days = PROMPT_SNOOZE_DAYS,
): boolean {
  if (dismissedAt === null || !Number.isFinite(dismissedAt)) return false;
  return now - dismissedAt < days * DAY_MS;
}

/** lastActiveAt is written at most once a day to save writes (DESIGN §9.6). */
export function isActivityStale(lastActiveAt: Date | null, now: Date): boolean {
  return lastActiveAt === null || now.getTime() - lastActiveAt.getTime() >= DAY_MS;
}
