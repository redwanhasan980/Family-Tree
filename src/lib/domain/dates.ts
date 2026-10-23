import { PartialDateSchema } from './schemas';

import type { Locale, PartialDate } from './types';

/** BCP 47 tags: bn-BD gives Bangla digits and month names (DESIGN §16.2). */
export const INTL_LOCALE: Record<Locale, string> = { bn: 'bn-BD', en: 'en-GB' };

export function isValidPartialDate(date: unknown): date is PartialDate {
  return PartialDateSchema.safeParse(date).success;
}

/** A sortable number: unknown months and days count as the start of the period. */
export function partialDateKey(date: PartialDate): number {
  return date.year * 10_000 + (date.month ?? 0) * 100 + (date.day ?? 0);
}

/** Orders dates oldest first. Missing dates sort after known ones. */
export function comparePartialDates(
  a: PartialDate | undefined,
  b: PartialDate | undefined,
): number {
  if (!a || !b) return a ? -1 : b ? 1 : 0;
  return partialDateKey(a) - partialDateKey(b);
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(locale: Locale, parts: 'y' | 'my' | 'dmy'): Intl.DateTimeFormat {
  const key = `${locale}:${parts}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(INTL_LOCALE[locale], {
      timeZone: 'UTC',
      year: 'numeric',
      ...(parts !== 'y' && { month: 'short' }),
      ...(parts === 'dmy' && { day: 'numeric' }),
    });
    formatters.set(key, f);
  }
  return f;
}

/**
 * "১৯৩১", "মার্চ ২০০৪", "১২ মার্চ, ২০০৪" / "1931", "Mar 2004", "12 Mar 2004".
 * The "approximately" marker is added by the UI from messages, because it is text.
 */
export function formatPartialDate(date: PartialDate, locale: Locale): string {
  const at = Date.UTC(date.year, (date.month ?? 1) - 1, date.day ?? 1);
  const parts = date.month === undefined ? 'y' : date.day === undefined ? 'my' : 'dmy';
  return formatter(locale, parts).format(at);
}

const yearFormatters = new Map<Locale, Intl.NumberFormat>();

/** A year in the locale's digits, without grouping ("১৯৩১"). Every card calls this. */
export function formatYear(year: number, locale: Locale): string {
  let f = yearFormatters.get(locale);
  if (!f) {
    f = new Intl.NumberFormat(INTL_LOCALE[locale], { useGrouping: false });
    yearFormatters.set(locale, f);
  }
  return f.format(year);
}

/**
 * Age in whole years at `at` (PER-09). It is approximate when the birth date is
 * approximate, or too incomplete to know whether the birthday has passed.
 */
export function ageAt(
  birth: PartialDate,
  at: PartialDate,
): { years: number; approximate: boolean } | null {
  let years = at.year - birth.year;
  let approximate = Boolean(birth.approximate || at.approximate);
  if (birth.month === undefined || at.month === undefined) {
    approximate = true;
  } else if (at.month < birth.month) {
    years -= 1;
  } else if (at.month === birth.month) {
    if (birth.day === undefined || at.day === undefined) approximate = true;
    else if (at.day < birth.day) years -= 1;
  }
  return years < 0 ? null : { years, approximate };
}

/** Today as a full partial date, in UTC. */
export function today(now: Date = new Date()): PartialDate {
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1, day: now.getUTCDate() };
}
