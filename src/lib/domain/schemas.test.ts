import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_TREE_SETTINGS,
  LIMITS,
  LocalizedNameSchema,
  NewPersonSchema,
  PartialDateSchema,
  PersonDetailsSchema,
  TreeDetailsSchema,
  TreeSettingsSchema,
} from './schemas';

function messages(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.success ? [] : (result.error?.issues.map((i) => i.message) ?? []);
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-10-22T00:00:00Z'), toFake: ['Date'] });
});
afterEach(() => vi.useRealTimers());

describe('PartialDateSchema', () => {
  it('accepts a year, a month, or a full date, and "approximately"', () => {
    for (const date of [
      { year: 1931 },
      { year: 2004, month: 3 },
      { year: 2004, month: 3, day: 12 },
      { year: 1931, approximate: true },
    ]) {
      expect(PartialDateSchema.safeParse(date).success).toBe(true);
    }
  });

  it('allows next year for a baby on the way, but not later', () => {
    expect(PartialDateSchema.safeParse({ year: 2027 }).success).toBe(true);
    expect(messages(PartialDateSchema.safeParse({ year: 2028 }))).toEqual(['yearOutOfRange']);
    expect(messages(PartialDateSchema.safeParse({ year: 999 }))).toEqual(['yearOutOfRange']);
  });

  it('checks months and days, including leap years', () => {
    expect(messages(PartialDateSchema.safeParse({ year: 2000, month: 13 }))).toEqual([
      'monthInvalid',
    ]);
    expect(messages(PartialDateSchema.safeParse({ year: 2023, month: 2, day: 29 }))).toEqual([
      'dayInvalid',
    ]);
    expect(PartialDateSchema.safeParse({ year: 2024, month: 2, day: 29 }).success).toBe(true);
    expect(messages(PartialDateSchema.safeParse({ year: 2024, month: 4, day: 31 }))).toEqual([
      'dayInvalid',
    ]);
    expect(messages(PartialDateSchema.safeParse({ year: 2024, day: 3 }))).toEqual([
      'dayWithoutMonth',
    ]);
    expect(messages(PartialDateSchema.safeParse({ year: 1990.5 }))).toEqual(['yearOutOfRange']);
  });
});

describe('LocalizedNameSchema', () => {
  it('needs a name in at least one language and trims it', () => {
    expect(LocalizedNameSchema.parse({ bn: '  আব্দুল করিম ' })).toEqual({ bn: 'আব্দুল করিম' });
    expect(LocalizedNameSchema.parse({ en: 'Karim', bn: '' })).toEqual({ en: 'Karim' });
    expect(messages(LocalizedNameSchema.safeParse({ en: ' ', bn: '' }))).toEqual(['nameRequired']);
    expect(messages(LocalizedNameSchema.safeParse({}))).toEqual(['nameRequired']);
  });

  it('limits each name to 120 characters', () => {
    expect(
      messages(LocalizedNameSchema.safeParse({ en: 'a'.repeat(LIMITS.personName + 1) })),
    ).toEqual(['nameTooLong']);
  });
});

describe('PersonDetailsSchema', () => {
  const minimal = { names: { en: 'Karim' }, gender: 'male', isLiving: true } as const;

  it('accepts a full profile and drops empty optional text', () => {
    const parsed = PersonDetailsSchema.parse({
      ...minimal,
      nickname: 'করিম মিয়া',
      birth: { date: { year: 1931, approximate: true }, place: 'শিবগঞ্জ' },
      death: { date: { year: 2004, month: 3 }, place: '' },
      profession: '',
      addresses: { present: 'Dhaka', permanent: '' },
      phones: ['+880 1711-000000', '(02) 955 1234'],
      email: '',
      description: 'A farmer.',
      photo: { publicId: 'shikor/prod/tree1/person1/a8Fz_x-1', version: 1, width: 10, height: 10 },
      customFields: [{ id: 'f1', label: 'Blood group', value: 'B+' }],
      childOrder: 1.5,
    });
    expect(parsed.profession).toBeUndefined();
    expect(parsed.email).toBeUndefined();
    expect(parsed.death).toEqual({ date: { year: 2004, month: 3 } });
    expect(parsed.addresses).toEqual({ present: 'Dhaka' });
  });

  it('enforces the SRS limits', () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ nickname: 'n'.repeat(61) }, 'nicknameTooLong'],
      [{ profession: 'p'.repeat(121) }, 'textTooLong'],
      [{ addresses: { present: 'a'.repeat(301) } }, 'textTooLong'],
      [{ description: 'd'.repeat(2001) }, 'descriptionTooLong'],
      [{ phones: ['1', '2', '3', '4'] }, 'tooManyPhones'],
      [{ phones: ['call me'] }, 'phoneInvalid'],
      [{ phones: ['1'.repeat(31)] }, 'phoneInvalid'],
      [{ email: 'not-an-email' }, 'emailInvalid'],
      [
        {
          customFields: Array.from({ length: 21 }, (_, i) => ({
            id: `f${i}`,
            label: 'L',
            value: 'V',
          })),
        },
        'tooManyCustomFields',
      ],
      [{ customFields: [{ id: 'f', label: ' ', value: 'V' }] }, 'customLabelRequired'],
      [{ customFields: [{ id: 'f', label: 'L', value: 'v'.repeat(301) }] }, 'textTooLong'],
    ];
    for (const [extra, error] of cases) {
      expect(messages(PersonDetailsSchema.safeParse({ ...minimal, ...extra }))).toEqual([error]);
    }
  });

  it('refuses a photo from another place', () => {
    const photo = { publicId: 'other/prod/t/p/x', version: 1, width: 1, height: 1 };
    expect(PersonDetailsSchema.safeParse({ ...minimal, photo }).success).toBe(false);
    expect(PersonDetailsSchema.safeParse({ ...minimal, photo: null }).success).toBe(true);
  });
});

describe('NewPersonSchema', () => {
  it('needs only a name and a gender; people are living unless said otherwise', () => {
    expect(NewPersonSchema.parse({ names: { bn: 'রহিমা' }, gender: 'female' })).toEqual({
      names: { bn: 'রহিমা' },
      gender: 'female',
      isLiving: true,
    });
    expect(NewPersonSchema.safeParse({ names: { bn: 'রহিমা' } }).success).toBe(false);
  });
});

describe('trees', () => {
  it('validates the tree name and description', () => {
    expect(TreeDetailsSchema.parse({ name: ' করিম পরিবার ', description: '' })).toEqual({
      name: 'করিম পরিবার',
    });
    expect(messages(TreeDetailsSchema.safeParse({ name: '' }))).toEqual(['treeNameRequired']);
    expect(messages(TreeDetailsSchema.safeParse({ name: 'n'.repeat(81) }))).toEqual([
      'treeNameTooLong',
    ]);
    expect(
      messages(TreeDetailsSchema.safeParse({ name: 'x', description: 'd'.repeat(501) })),
    ).toEqual(['textTooLong']);
  });

  it('has valid default settings', () => {
    expect(TreeSettingsSchema.parse(DEFAULT_TREE_SETTINGS)).toEqual(DEFAULT_TREE_SETTINGS);
  });
});
