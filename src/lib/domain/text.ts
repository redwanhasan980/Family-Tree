/**
 * Grapheme-safe string helpers. Bangla conjuncts (for example "ক্ষ") span several
 * code points, so user text is never sliced by index (CLAUDE.md rule 9).
 */

const segmenters = new Map<string, Intl.Segmenter>();

function segmenter(locale: string): Intl.Segmenter {
  let s = segmenters.get(locale);
  if (!s) {
    s = new Intl.Segmenter(locale, { granularity: 'grapheme' });
    segmenters.set(locale, s);
  }
  return s;
}

/** Splits text into user-perceived characters (extended grapheme clusters). */
export function graphemes(text: string, locale = 'bn'): string[] {
  return Array.from(segmenter(locale).segment(text), (part) => part.segment);
}

/** Shortens text to at most `max` graphemes, appending an ellipsis when it was cut. */
export function truncateGraphemes(text: string, max: number, locale = 'bn'): string {
  if (max <= 0) return '';
  const parts = graphemes(text, locale);
  if (parts.length <= max) return text;
  return `${parts.slice(0, Math.max(1, max - 1)).join('')}…`;
}
