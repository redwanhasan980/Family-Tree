import { describe, expect, it } from 'vitest';

import {
  ageAt,
  comparePartialDates,
  formatPartialDate,
  formatYear,
  isValidPartialDate,
  partialDateKey,
  today,
} from './dates';

describe('formatting (DESIGN §16.2)', () => {
  it('formats years, months and full dates in Bangla digits and month names', () => {
    expect(formatPartialDate({ year: 1931, approximate: true }, 'bn')).toBe('১৯৩১');
    expect(formatPartialDate({ year: 2004, month: 3 }, 'bn')).toBe('মার্চ ২০০৪');
    expect(formatPartialDate({ year: 2004, month: 3, day: 12 }, 'bn')).toMatch(/^১২ মার্চ,? ২০০৪$/);
  });

  it('formats them in English', () => {
    expect(formatPartialDate({ year: 1931 }, 'en')).toBe('1931');
    expect(formatPartialDate({ year: 2004, month: 3 }, 'en')).toBe('Mar 2004');
    expect(formatPartialDate({ year: 2004, month: 3, day: 12 }, 'en')).toBe('12 Mar 2004');
  });

  it('formats years without grouping', () => {
    expect(formatYear(1971, 'bn')).toBe('১৯৭১');
    expect(formatYear(1971, 'en')).toBe('1971');
  });
});

describe('comparing', () => {
  it('orders by year, then month, then day; unknown parts come first', () => {
    const dates = [
      { year: 2004, month: 3, day: 12 },
      { year: 2004 },
      { year: 1931 },
      { year: 2004, month: 3 },
    ];
    expect([...dates].sort(comparePartialDates)).toEqual([
      { year: 1931 },
      { year: 2004 },
      { year: 2004, month: 3 },
      { year: 2004, month: 3, day: 12 },
    ]);
    expect(partialDateKey({ year: 2004, month: 3, day: 12 })).toBe(20040312);
  });

  it('puts missing dates last', () => {
    expect(comparePartialDates(undefined, { year: 1 })).toBeGreaterThan(0);
    expect(comparePartialDates({ year: 1 }, undefined)).toBeLessThan(0);
    expect(comparePartialDates(undefined, undefined)).toBe(0);
  });
});

describe('validity and age', () => {
  it('checks partial dates with the shared schema', () => {
    expect(isValidPartialDate({ year: 1990, month: 2, day: 28 })).toBe(true);
    expect(isValidPartialDate({ year: 1990, month: 2, day: 30 })).toBe(false);
    expect(isValidPartialDate('1990')).toBe(false);
  });

  it('counts whole years, noting when it can only be approximate', () => {
    expect(ageAt({ year: 1990, month: 6, day: 15 }, { year: 2026, month: 6, day: 14 })).toEqual({
      years: 35,
      approximate: false,
    });
    expect(ageAt({ year: 1990, month: 6, day: 15 }, { year: 2026, month: 6, day: 15 })).toEqual({
      years: 36,
      approximate: false,
    });
    expect(ageAt({ year: 1990, month: 7 }, { year: 2026, month: 6, day: 1 })).toEqual({
      years: 35,
      approximate: false,
    });
    expect(ageAt({ year: 1990, month: 6 }, { year: 2026, month: 6, day: 1 })).toEqual({
      years: 36,
      approximate: true,
    });
    expect(ageAt({ year: 1990 }, { year: 2026, month: 1, day: 1 })).toEqual({
      years: 36,
      approximate: true,
    });
    expect(ageAt({ year: 1990, approximate: true }, { year: 2004 })).toEqual({
      years: 14,
      approximate: true,
    });
    expect(ageAt({ year: 2030 }, { year: 2026 })).toBeNull();
  });

  it('reads today in UTC', () => {
    expect(today(new Date('2026-10-22T23:30:00Z'))).toEqual({ year: 2026, month: 10, day: 22 });
  });
});
