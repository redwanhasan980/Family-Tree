import { describe, expect, it } from 'vitest';

import { makePerson } from './fixtures/factories';
import { normalizeSearchText, searchPersons } from './search';

describe('normalizeSearchText', () => {
  it('normalizes Unicode, case, zero-width characters and spaces', () => {
    // র + ZWJ + ্ + য (a common Bangla keyboard sequence) matches plain র্য.
    expect(normalizeSearchText('  র‍্যাব  ')).toBe('র্যাব');
    expect(normalizeSearchText('Abdul​   KARIM')).toBe('abdul karim');
    // Decomposed "য়" (য + nukta) becomes the composed character.
    expect(normalizeSearchText('য়')).toBe('য়'.normalize('NFC'));
  });
});

describe('searchPersons', () => {
  const people = [
    makePerson('a', { names: { en: 'Abdul Karim', bn: 'আব্দুল করিম' }, nickname: 'Karim Mia' }),
    makePerson('b', { names: { en: 'Karim' } }),
    makePerson('c', { names: { en: 'Rahima Karimun' } }),
    makePerson('d', { names: { bn: 'করিমা' } }),
    makePerson('e', { names: { en: 'Salam' }, nickname: 'Bokul' }),
  ];

  it('ranks exact, then prefix, then word-prefix, then substring matches', () => {
    expect(searchPersons(people, 'karim').map((h) => [h.personId, h.rank])).toEqual([
      ['b', 0],
      ['a', 1], // nickname "Karim Mia" starts with it
      ['c', 2],
    ]);
    expect(searchPersons(people, 'arim').map((h) => h.personId)).toEqual(['a', 'b', 'c']);
  });

  it('matches Bangla names and nicknames', () => {
    expect(searchPersons(people, 'করিম')).toEqual(
      [
        { personId: 'a', rank: 2, field: 'bn' },
        { personId: 'd', rank: 1, field: 'bn' },
      ].sort((x, y) => x.rank - y.rank),
    );
    expect(searchPersons(people, 'bokul')).toEqual([{ personId: 'e', rank: 0, field: 'nickname' }]);
  });

  it('limits results and ignores empty queries', () => {
    expect(searchPersons(people, 'a', 2)).toHaveLength(2);
    expect(searchPersons(people, '   ')).toEqual([]);
  });
});
