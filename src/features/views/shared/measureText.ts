import { graphemes } from '@/lib/domain/text';

/**
 * Text measurement for SVG views (DESIGN §13.1). SVG <text> doesn't wrap, so names are
 * broken into lines here, measured with a canvas using the same font, which shapes
 * Bangla correctly. Lines break between words, or between graphemes for a long word,
 * never inside a conjunct (CLAUDE.md rule 9).
 */

export type Measure = (text: string, font: string) => number;

const ELLIPSIS = '…';
const CACHE_LIMIT = 5000;

/** Rough width from the font size, where no canvas exists (server, tests). */
export const estimateWidth: Measure = (text, font) => {
  const size = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 14);
  return graphemes(text).length * size * 0.56;
};

let context: CanvasRenderingContext2D | null | undefined;
const cache = new Map<string, number>();

/** Canvas measurement with a cache; falls back to an estimate without a canvas. */
export const measureText: Measure = (text, font) => {
  const key = `${font}|${text}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  if (context === undefined) {
    try {
      context =
        typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
    } catch {
      context = null;
    }
  }
  let width: number;
  if (context) {
    context.font = font;
    width = context.measureText(text).width;
  } else {
    width = estimateWidth(text, font);
  }
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(key, width);
  return width;
};

const wordSegmenters = new Map<string, Intl.Segmenter>();

function words(text: string, locale: string): string[] {
  let segmenter = wordSegmenters.get(locale);
  if (!segmenter) {
    segmenter = new Intl.Segmenter(locale, { granularity: 'word' });
    wordSegmenters.set(locale, segmenter);
  }
  // Keep each word with the spaces after it, so joining gives the original text back.
  const parts: string[] = [];
  for (const { segment, isWordLike } of segmenter.segment(text)) {
    if (!isWordLike && /^\s+$/.test(segment) && parts.length > 0) {
      parts[parts.length - 1] += segment;
    } else if (!isWordLike && parts.length > 0 && !/^\s/.test(segment)) {
      parts[parts.length - 1] += segment;
    } else {
      parts.push(segment);
    }
  }
  return parts;
}

function fitGraphemes(
  text: string,
  maxWidth: number,
  font: string,
  measure: Measure,
  locale: string,
) {
  const parts = graphemes(text, locale);
  let fitted = '';
  for (const part of parts) {
    if (fitted && measure(fitted + part, font) > maxWidth) break;
    fitted += part;
  }
  return fitted;
}

/** Shortens text with an ellipsis until it fits, grapheme by grapheme. */
export function ellipsize(
  text: string,
  maxWidth: number,
  font: string,
  { measure = measureText, locale = 'bn' }: { measure?: Measure; locale?: string } = {},
): string {
  if (measure(text, font) <= maxWidth) return text;
  const parts = graphemes(text.trimEnd(), locale);
  while (parts.length > 1 && measure(parts.join('').trimEnd() + ELLIPSIS, font) > maxWidth) {
    parts.pop();
  }
  return parts.join('').trimEnd() + ELLIPSIS;
}

/** Up to `maxLines` lines no wider than `maxWidth`; the last one ends in "…" if cut. */
export function wrapText(
  text: string,
  {
    maxWidth,
    maxLines,
    font,
    locale = 'bn',
    measure = measureText,
  }: { maxWidth: number; maxLines: number; font: string; locale?: string; measure?: Measure },
): string[] {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (!clean) return [];
  const lines: string[] = [];
  let line = '';
  const queue = words(clean, locale);
  while (queue.length > 0) {
    const word = queue.shift()!;
    const candidate = line + word;
    if (measure(candidate.trimEnd(), font) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) {
      lines.push(line.trimEnd());
      line = '';
      queue.unshift(word);
    } else {
      // A single word wider than the line: break it between graphemes.
      const head = fitGraphemes(word, maxWidth, font, measure, locale);
      lines.push(head);
      const rest = word.slice(head.length);
      if (rest) queue.unshift(rest);
    }
    if (lines.length === maxLines) {
      const remaining = [line, ...queue].join('');
      if (remaining.trim()) {
        lines[maxLines - 1] = ellipsize(`${lines[maxLines - 1]} ${remaining}`, maxWidth, font, {
          measure,
          locale,
        });
      }
      return lines;
    }
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines;
}
