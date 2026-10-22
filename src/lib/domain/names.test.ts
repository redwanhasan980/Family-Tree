import { describe, expect, it } from 'vitest';

import { compareNames, displayName, initials } from './names';

const both = { en: 'Abdul Karim', bn: 'আব্দুল করিম' };

describe('displayName', () => {
  it('"auto" follows the UI language', () => {
    expect(displayName(both, 'auto', 'bn')).toEqual({ text: 'আব্দুল করিম', lang: 'bn' });
    expect(displayName(both, 'auto', 'en')).toEqual({ text: 'Abdul Karim', lang: 'en' });
  });

  it('a fixed language wins over the UI language', () => {
    expect(displayName(both, 'en', 'bn')).toEqual({ text: 'Abdul Karim', lang: 'en' });
    expect(displayName(both, 'bn', 'en')).toEqual({ text: 'আব্দুল করিম', lang: 'bn' });
  });

  it('falls back to whichever name exists', () => {
    expect(displayName({ bn: 'রহিমা' }, 'en', 'en')).toEqual({ text: 'রহিমা', lang: 'bn' });
    expect(displayName({ en: 'Rahima', bn: '  ' }, 'auto', 'bn')).toEqual({
      text: 'Rahima',
      lang: 'en',
    });
    expect(displayName({}, 'auto', 'bn')).toEqual({ text: '', lang: 'bn' });
  });

  it('"both" adds the other language as a second line when it differs', () => {
    expect(displayName(both, 'both', 'bn')).toEqual({
      text: 'আব্দুল করিম',
      lang: 'bn',
      secondary: { text: 'Abdul Karim', lang: 'en' },
    });
    expect(displayName({ en: 'Rina', bn: 'Rina' }, 'both', 'en')).toEqual({
      text: 'Rina',
      lang: 'en',
    });
    expect(displayName({ en: 'Rina' }, 'both', 'bn')).toEqual({ text: 'Rina', lang: 'en' });
  });
});

describe('initials', () => {
  it('takes the first and last word, grapheme-safe', () => {
    expect(initials('Abdul Karim', 'en')).toBe('AK');
    expect(initials('md. abdul karim', 'en')).toBe('MK');
    expect(initials('আব্দুল করিম')).toBe('আক');
    expect(initials('ক্ষমা')).toBe('ক্ষ');
    expect(initials('  ')).toBe('');
  });
});

describe('compareNames', () => {
  it('sorts by the locale, ignoring case', () => {
    expect(['karim', 'Abdul', 'rahim'].sort((a, b) => compareNames(a, b, 'en'))).toEqual([
      'Abdul',
      'karim',
      'rahim',
    ]);
    expect(compareNames('Karim', 'karim', 'en')).toBe(0);
    expect(['মা', 'কা', 'আ'].sort((a, b) => compareNames(a, b, 'bn'))).toEqual(['আ', 'কা', 'মা']);
  });
});
