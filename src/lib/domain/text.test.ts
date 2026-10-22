import { describe, expect, it } from 'vitest';

import { graphemes, truncateGraphemes } from './text';

describe('graphemes', () => {
  it('keeps Bangla vowel signs attached to their consonant', () => {
    expect(graphemes('শিকড়')).toEqual(['শি', 'ক', 'ড়']);
  });

  it('never splits a conjunct into stray code points', () => {
    const parts = graphemes('ক্ষমা');
    expect(parts.join('')).toBe('ক্ষমা');
    expect(parts.every((p) => !p.startsWith('্'))).toBe(true);
  });

  it('splits Latin text per letter', () => {
    expect(graphemes('Rahim', 'en')).toEqual(['R', 'a', 'h', 'i', 'm']);
  });
});

describe('truncateGraphemes', () => {
  it('returns short text unchanged', () => {
    expect(truncateGraphemes('রহিম', 10)).toBe('রহিম');
  });

  it('cuts on grapheme boundaries and adds an ellipsis', () => {
    expect(truncateGraphemes('আব্দুল করিম', 4)).toBe(
      `${graphemes('আব্দুল করিম').slice(0, 3).join('')}…`,
    );
  });

  it('returns an empty string for a non-positive limit', () => {
    expect(truncateGraphemes('রহিম', 0)).toBe('');
  });
});
