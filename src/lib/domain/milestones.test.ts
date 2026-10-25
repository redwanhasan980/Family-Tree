import { describe, expect, it } from 'vitest';

import { countVisit, invitesUpgrade, isMilestone, reachedMilestone } from './milestones';

const size = (people: number, generations = 1) => ({ people, generations });

describe('reachedMilestone', () => {
  it('celebrates crossing 10, 50 and 100 people and 5 generations', () => {
    expect(reachedMilestone(size(9), size(10), [])).toBe('people10');
    expect(reachedMilestone(size(49), size(52), [])).toBe('people50');
    expect(reachedMilestone(size(99), size(100), [])).toBe('people100');
    expect(reachedMilestone(size(20, 4), size(21, 5), [])).toBe('generations5');
  });

  it('ignores changes that stay on one side, or go down', () => {
    expect(reachedMilestone(size(10), size(11), [])).toBeNull();
    expect(reachedMilestone(size(8), size(9), [])).toBeNull();
    expect(reachedMilestone(size(10), size(9), [])).toBeNull();
    expect(reachedMilestone(size(30, 6), size(31, 6), [])).toBeNull();
  });

  it('celebrates each milestone once', () => {
    expect(reachedMilestone(size(9), size(10), ['people10'])).toBeNull();
  });

  it('keeps the biggest when one change crosses several', () => {
    expect(reachedMilestone(size(3), size(120, 6), [])).toBe('people100');
    expect(reachedMilestone(size(3), size(120, 6), ['people100'])).toBe('people50');
  });
});

describe('invitesUpgrade', () => {
  it('asks once a change brings the tree to five people or more', () => {
    expect(invitesUpgrade(size(4), size(5))).toBe(true);
    expect(invitesUpgrade(size(12), size(13))).toBe(true);
    expect(invitesUpgrade(size(3), size(4))).toBe(false);
    expect(invitesUpgrade(size(6), size(6))).toBe(false);
    expect(invitesUpgrade(size(7), size(6))).toBe(false);
  });
});

describe('countVisit', () => {
  it('counts one visit per day', () => {
    const first = countVisit(null, '2026-10-01');
    expect(first).toEqual({ count: 1, last: '2026-10-01' });
    expect(countVisit(first, '2026-10-01')).toBe(first);
    expect(countVisit(first, '2026-10-03')).toEqual({ count: 2, last: '2026-10-03' });
  });
});

describe('isMilestone', () => {
  it('recognises stored milestones', () => {
    expect(isMilestone('people50')).toBe(true);
    expect(isMilestone('people7')).toBe(false);
    expect(isMilestone(10)).toBe(false);
  });
});
