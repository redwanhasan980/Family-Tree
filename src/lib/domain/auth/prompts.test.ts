import { describe, expect, it } from 'vitest';

import { isActivityStale, isSnoozed } from './prompts';

const DAY = 24 * 60 * 60 * 1000;

describe('isSnoozed', () => {
  it('snoozes for seven days after dismissal', () => {
    const now = Date.UTC(2026, 9, 22);
    expect(isSnoozed(now - 6 * DAY, now)).toBe(true);
    expect(isSnoozed(now - 7 * DAY, now)).toBe(false);
  });

  it('is not snoozed without a valid dismissal time', () => {
    expect(isSnoozed(null, Date.now())).toBe(false);
    expect(isSnoozed(Number.NaN, Date.now())).toBe(false);
  });
});

describe('isActivityStale', () => {
  it('is stale when missing or older than a day', () => {
    const now = new Date('2026-10-22T12:00:00Z');
    expect(isActivityStale(null, now)).toBe(true);
    expect(isActivityStale(new Date(now.getTime() - DAY), now)).toBe(true);
    expect(isActivityStale(new Date(now.getTime() - DAY + 1), now)).toBe(false);
  });
});
