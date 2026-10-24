import { describe, expect, it } from 'vitest';

import {
  AncestorFormSchema,
  ancestorTreeInput,
  createTreeInput,
  CreateTreeFormSchema,
  matchesTreeName,
  needsNameToDelete,
} from './treeForms';

const parse = (form: unknown) => CreateTreeFormSchema.safeParse(form);

describe('CreateTreeFormSchema', () => {
  it('needs a tree name and, with a first person, their gender', () => {
    expect(parse({ name: ' ', rootName: '' }).error?.issues[0]?.message).toBe('treeNameRequired');
    expect(parse({ name: 'Karim', rootName: 'Abdul Karim' }).error?.issues).toMatchObject([
      { message: 'genderRequired', path: ['rootGender'] },
    ]);
    expect(
      parse({ name: 'Karim', rootName: 'Abdul Karim', rootGender: null }).error?.issues[0]?.message,
    ).toBe('genderRequired');
    expect(parse({ name: 'Karim', rootName: '  ' }).success).toBe(true);
  });

  it('turns the form into createTree input, the name stored in its own language', () => {
    const tree = parse({ name: ' করিম পরিবার ', rootName: 'আব্দুল করিম', rootGender: 'male' });
    expect(createTreeInput(tree.data!)).toEqual({
      name: 'করিম পরিবার',
      root: { names: { bn: 'আব্দুল করিম' }, gender: 'male' },
    });
    expect(createTreeInput(parse({ name: 'Karim', rootName: '' }).data!)).toEqual({
      name: 'Karim',
    });
  });
});

describe('deleting a tree (TREE-03)', () => {
  it('asks for the name only above ten people', () => {
    expect(needsNameToDelete(10)).toBe(false);
    expect(needsNameToDelete(11)).toBe(true);
  });

  it('compares the typed name loosely on spaces and Unicode form', () => {
    expect(matchesTreeName('  করিম   পরিবার ', 'করিম পরিবার')).toBe(true);
    expect(matchesTreeName('Café', 'Café')).toBe(true);
    expect(matchesTreeName('karim family', 'Karim family')).toBe(false);
  });
});

describe('the first-run wizard (ONB-02)', () => {
  it('needs a name and man or woman', () => {
    expect(AncestorFormSchema.safeParse({ rootName: '  ', rootGender: 'male' }).success).toBe(
      false,
    );
    expect(AncestorFormSchema.safeParse({ rootName: 'করিম', rootGender: null }).success).toBe(
      false,
    );
    const form = AncestorFormSchema.parse({ rootName: ' আব্দুল করিম ', rootGender: 'male' });
    expect(ancestorTreeInput(form, 'পরিবার: আব্দুল করিম')).toEqual({
      name: 'পরিবার: আব্দুল করিম',
      root: { names: { bn: 'আব্দুল করিম' }, gender: 'male' },
    });
  });

  it('keeps a long tree name within the limit, cut between graphemes', () => {
    const form = AncestorFormSchema.parse({ rootName: 'Karim', rootGender: 'male' });
    const name = ancestorTreeInput(form, 'ক্ষ'.repeat(100)).name;
    expect(name).toBe('ক্ষ'.repeat(26)); // 3 units each: 78 of the 80 allowed
  });
});
