import { graphemes } from './text';

import type { Locale, LocalizedName, NameDisplay } from './types';

/** A name to show, with its language so the UI can set `lang` on it (I18N-03). */
export interface ShownName {
  text: string;
  lang: Locale;
  /** The other language's name, shown smaller when the tree setting is "both". */
  secondary?: { text: string; lang: Locale };
}

const other = (locale: Locale): Locale => (locale === 'bn' ? 'en' : 'bn');

/**
 * Picks the name to show (DESIGN §16.4). "auto" follows the UI language; "en"/"bn" prefer
 * that language; "both" adds the other language as a second line. Missing names fall back
 * to the language that exists.
 */
export function displayName(
  names: LocalizedName,
  setting: NameDisplay,
  uiLocale: Locale,
): ShownName {
  const preferred = setting === 'en' || setting === 'bn' ? setting : uiLocale;
  const first = names[preferred]?.trim();
  const second = names[other(preferred)]?.trim();
  if (!first) return { text: second ?? '', lang: second ? other(preferred) : preferred };
  const shown: ShownName = { text: first, lang: preferred };
  if (setting === 'both' && second && second !== first) {
    shown.secondary = { text: second, lang: other(preferred) };
  }
  return shown;
}

/**
 * Up to two initials (first and last word) for avatars. Grapheme-safe, so Bangla
 * conjuncts such as "ক্ষ" stay whole (CLAUDE.md rule 9).
 */
export function initials(name: string, lang: Locale = 'bn'): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  const picked = words.length === 1 ? [words[0]!] : [words[0]!, words[words.length - 1]!];
  return picked
    .map((word) => graphemes(word, lang)[0] ?? '')
    .join('')
    .toLocaleUpperCase(lang === 'bn' ? 'bn' : 'en');
}

const collators = new Map<Locale, Intl.Collator>();

/** Locale-aware name comparison, used as the last tie-breaker when sorting people. */
export function compareNames(a: string, b: string, locale: Locale): number {
  let collator = collators.get(locale);
  if (!collator) {
    collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true });
    collators.set(locale, collator);
  }
  return collator.compare(a, b);
}
