import { describe, expect, it } from 'vitest';

import { buildGraph } from './build';
import {
  closeRelatives,
  dateWarnings,
  findDuplicates,
  hasErrors,
  isAncestor,
  validateParentLink,
  validateSpouseLink,
  wouldCreateCycle,
} from './validate';
import { makeParentLink, makePerson, makeSpouseLink } from '../fixtures/factories';
import { testFamily } from '../fixtures/testFamily';

const { persons, relationships } = testFamily();
const g = buildGraph(persons, relationships);
const codes = (issues: { code: string }[]) => issues.map((i) => i.code);

describe('cycles (AC REL-10)', () => {
  it('blocks making a grandchild the father of their grandfather', () => {
    expect(isAncestor(g, 'G', 'SS')).toBe(true);
    expect(isAncestor(g, 'SS', 'G')).toBe(false);
    expect(wouldCreateCycle(g, 'SS', 'G')).toBe(true);
    expect(wouldCreateCycle(g, 'G', 'G')).toBe(true);
    expect(wouldCreateCycle(g, 'O', 'G')).toBe(false);
    expect(
      codes(validateParentLink(g, { parentId: 'SS', childId: 'G', kind: 'biological' })),
    ).toEqual(['cycle']);
  });
});

describe('validateParentLink', () => {
  it('refuses missing people, self-links and existing links', () => {
    expect(
      codes(validateParentLink(g, { parentId: 'ghost', childId: 'G', kind: 'biological' })),
    ).toEqual(['missingPerson']);
    expect(
      codes(validateParentLink(g, { parentId: 'G', childId: 'G', kind: 'biological' })),
    ).toEqual(['selfRelationship']);
    expect(
      codes(validateParentLink(g, { parentId: 'G', childId: 'S1', kind: 'adoptive' })),
    ).toEqual(['alreadyParent']);
  });

  it('allows at most one biological father and one biological mother', () => {
    const issues = validateParentLink(g, { parentId: 'H', childId: 'S1', kind: 'biological' });
    expect(issues).toEqual([
      { severity: 'error', code: 'tooManyBiologicalParents', params: { gender: 'male' } },
    ]);
    expect(hasErrors(issues)).toBe(true);
    // A stepfather is fine (H and S1 share a birth year, so only a warning remains).
    const step = validateParentLink(g, { parentId: 'H', childId: 'S1', kind: 'step' });
    expect(step).toEqual([{ severity: 'warning', code: 'parentTooYoung', params: { years: 0 } }]);
    expect(hasErrors(step)).toBe(false);
    // Changing the father replaces the old link.
    const replaced = validateParentLink(g, {
      parentId: 'H',
      childId: 'S1',
      kind: 'biological',
      replacing: 'G',
    });
    expect(hasErrors(replaced)).toBe(false);
    // An unknown-gender parent still can't be a third biological parent.
    expect(
      codes(validateParentLink(g, { parentId: 'O', childId: 'S1', kind: 'biological' })),
    ).toEqual(['tooManyBiologicalParents']);
    // …but can be the second.
    expect(validateParentLink(g, { parentId: 'O', childId: 'A', kind: 'biological' })).toEqual([]);
  });

  it('refuses making a spouse a parent', () => {
    expect(codes(validateParentLink(g, { parentId: 'DD', childId: 'SS', kind: 'step' }))).toEqual([
      'spouseParentConflict',
    ]);
  });

  it('warns about implausible dates without blocking', () => {
    expect(dateWarnings(g, 'K', 'O')).toEqual([]);
    expect(validateParentLink(g, { parentId: 'K', childId: 'A', kind: 'adoptive' })).toEqual([
      { severity: 'warning', code: 'parentBornAfterChild' },
    ]);
    expect(validateParentLink(g, { parentId: 'P', childId: 'A', kind: 'step' })).toEqual([]);
    const young = buildGraph(
      [
        makePerson('p', { birth: { date: { year: 2000 } } }),
        makePerson('c', { birth: { date: { year: 2010 } } }),
      ],
      [],
    );
    expect(dateWarnings(young, 'p', 'c')).toEqual([
      { severity: 'warning', code: 'parentTooYoung', params: { years: 10 } },
    ]);
    expect(hasErrors(dateWarnings(young, 'p', 'c'))).toBe(false);
  });
});

describe('validateSpouseLink', () => {
  it('refuses self, duplicate and parent–child marriages', () => {
    expect(codes(validateSpouseLink(g, 'G', 'ghost'))).toEqual(['missingPerson']);
    expect(codes(validateSpouseLink(g, 'G', 'G'))).toEqual(['selfRelationship']);
    expect(codes(validateSpouseLink(g, 'W1', 'G'))).toEqual(['alreadySpouses']);
    expect(codes(validateSpouseLink(g, 'G', 'S1'))).toEqual(['spouseParentConflict']);
    expect(codes(validateSpouseLink(g, 'S1', 'G'))).toEqual(['spouseParentConflict']);
    expect(validateSpouseLink(g, 'X', 'P')).toEqual([]);
  });
});

describe('duplicates (PER-07)', () => {
  const family = buildGraph(
    [
      makePerson('dad', { names: { en: 'Karim' } }),
      makePerson('kid1', { names: { en: 'Rahim', bn: 'রহিম' } }),
      makePerson('kid2', { names: { bn: 'সালাম' } }),
    ],
    [
      makeParentLink('dad', 'kid1'),
      makeParentLink('dad', 'kid2'),
      makeSpouseLink('kid1', 'kid2'),
    ].slice(0, 2),
  );

  it('finds a close relative with the same name in either language', () => {
    expect(closeRelatives(family, 'dad')).toEqual(['kid1', 'kid2']);
    expect(closeRelatives(family, 'kid1')).toEqual(['dad', 'kid2']);
    expect(findDuplicates(family, { en: ' rahim ' }, closeRelatives(family, 'dad'))).toEqual([
      'kid1',
    ]);
    expect(findDuplicates(family, { bn: 'সালাম' }, ['kid1', 'kid2', 'ghost'])).toEqual(['kid2']);
    expect(findDuplicates(family, { en: 'Salam' }, ['kid1', 'kid2'])).toEqual([]);
    expect(findDuplicates(family, {}, ['kid1'])).toEqual([]);
  });
});
