import { describe, expect, it } from 'vitest';

import { makePerson } from '@/lib/domain/fixtures/factories';
import { testFamily } from '@/lib/domain/fixtures/testFamily';
import { buildGraph } from '@/lib/domain/graph';

import {
  activeFilters,
  branchesOf,
  branchHeads,
  directoryEntries,
  filterDirectory,
  NO_FILTERS,
  sortDirectory,
  type DirectoryEntry,
} from './directory';

const { persons, relationships } = testFamily();
const living = persons.map((p) => (['G', 'W1'].includes(p.id) ? { ...p, isLiving: false } : p));
const nicknamed = living.map((p) => (p.id === 'S2' ? { ...p, nickname: 'Babu' } : p));
const g = buildGraph(nicknamed, relationships);
const entries = directoryEntries(g, 'G', 'auto', 'en');
const ids = (list: DirectoryEntry[]) => list.map((e) => e.person.id);
const entry = (id: string) => entries.find((e) => e.person.id === id)!;

describe('directory entries (LV-04)', () => {
  it('lists everyone, with generations from the start', () => {
    expect(entries).toHaveLength(nicknamed.length);
    expect(entry('G').generation).toBe(1);
    expect(entry('W2').generation).toBe(1);
    expect(entry('K').generation).toBe(4);
    expect(entry('O').generation).toBeNull();
    expect(entry('SS').name).toEqual({ text: 'SS', lang: 'en' });
  });

  it('puts descendants and their partners in the branch of the start’s child', () => {
    const branches = branchesOf(g, 'G');
    expect(branchHeads(g, 'G')).toEqual(['S1', 'D1', 'S2', 'X']);
    expect(branches.get('S1')).toBe(0);
    expect(branches.get('SW')).toBe(0);
    // K is first reached through S1's son, so stays in that branch.
    expect(branches.get('K')).toBe(0);
    expect(branches.get('H')).toBe(1);
    expect(branches.get('A')).toBe(2);
    expect(branches.get('P')).toBe(3);
    expect(branches.has('G')).toBe(false);
    expect(branches.has('W1')).toBe(false);
    expect(branchesOf(g, null).size).toBe(0);
    expect(branchHeads(g, null)).toEqual([]);
  });
});

describe('filterDirectory', () => {
  it('filters by living, gender, generation and branch', () => {
    expect(ids(filterDirectory(entries, { ...NO_FILTERS, status: 'deceased' }))).toEqual([
      'G',
      'W1',
    ]);
    expect(filterDirectory(entries, { ...NO_FILTERS, status: 'living' })).toHaveLength(
      entries.length - 2,
    );
    expect(
      ids(filterDirectory(entries, { ...NO_FILTERS, gender: 'female', generation: 2 })),
    ).toEqual(['D1', 'SW', 'P']);
    expect(ids(filterDirectory(entries, { ...NO_FILTERS, branch: 2 }))).toEqual(['S2', 'A']);
  });

  it('searches names and nicknames, best match first', () => {
    expect(ids(filterDirectory(entries, { ...NO_FILTERS, query: 'babu' }))).toEqual(['S2']);
    expect(ids(filterDirectory(entries, { ...NO_FILTERS, query: 's' }))[0]).toBe('S1');
    expect(filterDirectory(entries, { ...NO_FILTERS, query: '  ' })).toHaveLength(entries.length);
  });

  it('counts the filters that are on', () => {
    expect(activeFilters(NO_FILTERS)).toBe(0);
    expect(activeFilters({ ...NO_FILTERS, query: 'x', gender: 'male', branch: 0 })).toBe(2);
    expect(activeFilters({ ...NO_FILTERS, status: 'living', generation: 1 })).toBe(2);
  });
});

describe('sortDirectory', () => {
  const some = entries.filter((e) => ['G', 'S1', 'D1', 'O', 'K'].includes(e.person.id));

  it('sorts by name either way', () => {
    expect(ids(sortDirectory(some, 'name', 'asc', 'en'))).toEqual(['D1', 'G', 'K', 'O', 'S1']);
    expect(ids(sortDirectory(some, 'name', 'desc', 'en'))).toEqual(['S1', 'O', 'K', 'G', 'D1']);
  });

  it('sorts by birth and generation with unknowns last', () => {
    expect(ids(sortDirectory(some, 'birth', 'asc', 'en'))).toEqual(['G', 'S1', 'D1', 'K', 'O']);
    expect(ids(sortDirectory(some, 'birth', 'desc', 'en'))).toEqual(['K', 'D1', 'S1', 'G', 'O']);
    expect(ids(sortDirectory(some, 'generation', 'asc', 'en'))).toEqual([
      'G',
      'D1',
      'S1',
      'K',
      'O',
    ]);
    expect(ids(sortDirectory(some, 'generation', 'desc', 'en'))).toEqual([
      'K',
      'D1',
      'S1',
      'G',
      'O',
    ]);
  });

  it('breaks ties by name, then ID', () => {
    const twins = directoryEntries(
      buildGraph(
        [makePerson('b', { names: { en: 'Same' } }), makePerson('a', { names: { en: 'Same' } })],
        [],
      ),
      null,
      'auto',
      'en',
    );
    expect(ids(sortDirectory(twins, 'birth', 'asc', 'en'))).toEqual(['a', 'b']);
    expect(ids(sortDirectory(twins, 'name', 'asc', 'en'))).toEqual(['a', 'b']);
    expect(ids(sortDirectory(twins, 'generation', 'asc', 'en'))).toEqual(['a', 'b']);
  });
});
