import { describe, expect, it } from 'vitest';

import { makePerson } from './fixtures/factories';
import {
  dateFromDraft,
  draftFieldOf,
  draftFromPerson,
  patchFromDraft,
  QuickPersonFormSchema,
  quickPersonInput,
} from './personForms';
import { toAsciiDigits } from './text';

describe('QuickPersonFormSchema', () => {
  it('needs a name and man or woman', () => {
    const messages = (form: unknown) =>
      QuickPersonFormSchema.safeParse(form).error?.issues.map((i) => i.message);
    expect(messages({ name: ' ', gender: 'male' })).toEqual(['nameRequired']);
    expect(messages({ name: 'Karim', gender: null })).toEqual(['genderRequired']);
    expect(messages({ name: 'x'.repeat(121), gender: 'female' })).toEqual(['nameTooLong']);
  });

  it('stores the name under the language it was typed in', () => {
    const form = QuickPersonFormSchema.parse({ name: ' রহিমা বেগম ', gender: 'female' });
    expect(quickPersonInput(form)).toEqual({ names: { bn: 'রহিমা বেগম' }, gender: 'female' });
  });
});

describe('details draft (PER-02/05)', () => {
  const person = makePerson('p', {
    names: { en: 'Abdul Karim', bn: 'আব্দুল করিম' },
    gender: 'male',
    isLiving: false,
    birth: { date: { year: 1931, month: 4 }, place: 'Shibganj' },
    death: { date: { year: 2004, approximate: true } },
    profession: 'Farmer',
    addresses: { permanent: 'Shibganj, Bogura' },
    phones: ['+880 1711 000000'],
    customFields: [{ id: 'c1', label: 'Blood group', value: 'B+' }],
  });

  it('round-trips a person through the form', () => {
    const draft = draftFromPerson(person);
    expect(draft).toMatchObject({
      nameEn: 'Abdul Karim',
      birth: { day: '', month: '4', year: '1931' },
      birthPlace: 'Shibganj',
      death: { year: '2004' },
      deathApprox: true,
      presentAddress: '',
      phones: ['+880 1711 000000'],
    });
    expect(patchFromDraft(draft)).toEqual({
      names: { en: 'Abdul Karim', bn: 'আব্দুল করিম' },
      nickname: undefined,
      gender: 'male',
      isLiving: false,
      birth: { date: { year: 1931, month: 4 }, place: 'Shibganj' },
      death: { date: { year: 2004, approximate: true } },
      profession: 'Farmer',
      education: undefined,
      addresses: { permanent: 'Shibganj, Bogura' },
      phones: ['+880 1711 000000'],
      email: undefined,
      description: undefined,
      customFields: [{ id: 'c1', label: 'Blood group', value: 'B+' }],
    });
    // A person with no phones starts with one empty row to type in.
    expect(draftFromPerson(makePerson('q')).phones).toEqual(['']);
  });

  it('reads Bangla digits, clears empty values and drops the death of a living person', () => {
    const draft = draftFromPerson(person);
    const patch = patchFromDraft({
      ...draft,
      nameEn: ' ',
      isLiving: true,
      birth: { day: '৫', month: '৪', year: '১৯৩১' },
      birthApprox: true,
      birthPlace: ' ',
      profession: '  ',
      permanentAddress: '',
      phones: ['', '০১৭১১ ০০০০০০ ', ''],
      email: ' karim@example.com ',
      customFields: [{ id: 'c2', label: ' ', value: '' }],
    });
    expect(patch.names).toEqual({ bn: 'আব্দুল করিম' });
    expect(patch.birth).toEqual({ date: { year: 1931, month: 4, day: 5, approximate: true } });
    expect(patch.death).toBeUndefined();
    expect(patch.profession).toBeUndefined();
    expect(patch.addresses).toBeUndefined();
    expect(patch.phones).toEqual(['01711 000000']);
    expect(patch.email).toBe('karim@example.com');
    expect(patch.customFields).toBeUndefined();
    expect(dateFromDraft({ day: '', month: '', year: '' })).toBeUndefined();
    expect(dateFromDraft({ day: '', month: '3', year: '' })?.year).toBeNaN();
    expect(toAsciiDigits('১৯৫২ সাল')).toBe('1952 সাল');
  });

  it('finds the form field of a validation issue, row by row', () => {
    const draft = {
      ...draftFromPerson(person),
      phones: ['', 'abc'],
      customFields: [
        { id: 'a', label: '', value: '' },
        { id: 'b', label: '', value: 'B+' },
      ],
    };
    expect(draftFieldOf('names.en', draft)).toBe('nameEn');
    expect(draftFieldOf('names.bn', draft)).toBe('nameBn');
    expect(draftFieldOf('names', draft)).toBe('nameEn');
    expect(draftFieldOf('birth.date.year', draft)).toBe('birth');
    expect(draftFieldOf('death.place', draft)).toBe('deathPlace');
    expect(draftFieldOf('addresses.present', draft)).toBe('presentAddress');
    expect(draftFieldOf('addresses.permanent', draft)).toBe('permanentAddress');
    // The first saved phone is the second row.
    expect(draftFieldOf('phones.0', draft)).toBe('phone:1');
    expect(draftFieldOf('phones', draft)).toBe('phones');
    expect(draftFieldOf('customFields.0.label', draft)).toBe('custom:b:label');
    expect(draftFieldOf('customFields.0.value', draft)).toBe('custom:b:value');
    expect(draftFieldOf('customFields', draft)).toBe('customFields');
    expect(draftFieldOf('email', draft)).toBe('email');
    expect(draftFieldOf('description', draft)).toBe('description');
    expect(draftFieldOf('childOrder', draft)).toBeNull();
  });
});
