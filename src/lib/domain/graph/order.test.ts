import { describe, expect, it } from 'vitest';

import {
  compareParentLinks,
  compareSpouseLinks,
  nextSiblingKey,
  siblingKeys,
  sortSiblings,
} from './order';
import { makeParentLink, makePerson, makeSpouseLink, stamps } from '../fixtures/factories';

const ids = (people: { id: string }[]) => people.map((p) => p.id);

describe('sibling order', () => {
  it('falls back to birth date, creation time, name and ID', () => {
    const people = [
      makePerson('d', { names: { en: 'Zed' }, ...stamps(5) }),
      makePerson('c', { names: { en: 'Amy' }, ...stamps(5) }),
      makePerson('b', { ...stamps(1) }),
      makePerson('a', { birth: { date: { year: 1990 } }, ...stamps(9) }),
      makePerson('e', { names: { en: 'Amy' }, ...stamps(5) }),
    ];
    expect(ids(sortSiblings(people))).toEqual(['a', 'b', 'c', 'e', 'd']);
  });

  it('places explicit orders in the same number space as the fallback rank', () => {
    const people = [
      makePerson('born1950', { birth: { date: { year: 1950 } } }),
      makePerson('born1960', { birth: { date: { year: 1960 } } }),
      makePerson('addedLater', { childOrder: 2 }),
      makePerson('movedFirst', { birth: { date: { year: 1970 } }, childOrder: -1 }),
    ];
    expect(ids(sortSiblings(people))).toEqual(['movedFirst', 'born1950', 'born1960', 'addedLater']);
    expect(siblingKeys(people)).toEqual(
      new Map([
        ['born1950', 0],
        ['born1960', 1],
        ['movedFirst', -1],
        ['addedLater', 2],
      ]),
    );
    expect(nextSiblingKey(people)).toBe(3);
    expect(nextSiblingKey([])).toBe(0);
    expect(nextSiblingKey([makePerson('x', { childOrder: 4.5 })])).toBe(5);
  });

  it('keeps birth order for equal keys', () => {
    const people = [
      makePerson('second', { birth: { date: { year: 1960 } }, childOrder: 0 }),
      makePerson('first', { birth: { date: { year: 1950 } } }),
    ];
    expect(ids(sortSiblings(people))).toEqual(['first', 'second']);
  });
});

describe('parent and spouse order', () => {
  it('puts biological parents first, then father before mother', () => {
    const persons = new Map(
      [
        makePerson('mum', { gender: 'female' }),
        makePerson('dad', { gender: 'male' }),
        makePerson('step', { gender: 'male' }),
        makePerson('who'),
      ].map((p) => [p.id, p]),
    );
    const links = [
      makeParentLink('step', 'k', 'step'),
      makeParentLink('mum', 'k'),
      makeParentLink('who', 'k'),
      makeParentLink('dad', 'k'),
      makeParentLink('ghost', 'k'),
    ];
    expect(links.sort((a, b) => compareParentLinks(a, b, persons)).map((l) => l.parentId)).toEqual([
      'dad',
      'mum',
      'ghost',
      'who',
      'step',
    ]);
  });

  it('orders marriages by sequence, then date, then when recorded', () => {
    const links = [
      makeSpouseLink('p', 'late', { ...stamps(9) }),
      makeSpouseLink('p', 'dated', { marriageDate: { year: 1990 }, ...stamps(9) }),
      makeSpouseLink('p', 'second', { sequence: 2 }),
      makeSpouseLink('p', 'first', { sequence: 1 }),
      makeSpouseLink('p', 'early', { ...stamps(1) }),
      makeSpouseLink('p', 'zz', { ...stamps(9) }),
    ];
    expect(links.sort(compareSpouseLinks).map((l) => l.personIds.find((id) => id !== 'p'))).toEqual(
      ['first', 'second', 'dated', 'early', 'late', 'zz'],
    );
  });
});
