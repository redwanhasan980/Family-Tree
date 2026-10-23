import { describe, expect, it } from 'vitest';

import { ellipsize, estimateWidth, wrapText, type Measure } from './measureText';

// One unit per grapheme keeps the expectations readable.
const perGrapheme: Measure = (text) =>
  [...new Intl.Segmenter('bn', { granularity: 'grapheme' }).segment(text)].length;
const wrap = (text: string, maxWidth: number, maxLines = 2) =>
  wrapText(text, { maxWidth, maxLines, font: '14px x', measure: perGrapheme });

describe('wrapText (DESIGN §13.1)', () => {
  it('breaks between words', () => {
    expect(wrap('Abdul Karim Mia', 11)).toEqual(['Abdul Karim', 'Mia']);
    expect(wrap('আব্দুল করিম', 20)).toEqual(['আব্দুল করিম']);
  });

  it('ends the last line with an ellipsis when the name is cut', () => {
    expect(wrap('Abdul Karim Mia Chowdhury', 11)).toEqual(['Abdul Karim', 'Mia Chowdh…']);
    expect(wrap('Muhammad', 4, 1)).toEqual(['Muh…']);
  });

  it('never splits a Bangla conjunct', () => {
    const lines = wrap('ক্ষমাশীলতাপূর্ণ', 3, 3);
    expect(lines.join('').replace('…', '')).toMatch(/^ক্ষ/);
    for (const line of lines) expect(line).not.toMatch(/^্/);
  });

  it('returns nothing for empty text and estimates widths without a canvas', () => {
    expect(wrap('   ', 10)).toEqual([]);
    expect(estimateWidth('abcd', '600 10px Inter')).toBeCloseTo(22.4);
    expect(ellipsize('short', 100, '14px x', { measure: perGrapheme })).toBe('short');
  });
});
