import { describe, expect, it } from 'vitest';

import { makePerson } from './fixtures/factories';
import {
  dateFromDraft,
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

describe('details draft (PER-05)', () => {
  const person = makePerson('p', {
    names: { en: 'Abdul Karim', bn: 'আব্দুল করিম' },
    gender: 'male',
    isLiving: false,
    birth: { date: { year: 1931, month: 4 }, place: 'Shibganj' },
    death: { date: { year: 2004, approximate: true } },
  });

  it('round-trips a person through the form', () => {
    const draft = draftFromPerson(person);
    expect(draft).toMatchObject({
      nameEn: 'Abdul Karim',
      birth: { day: '', month: '4', year: '1931' },
      death: { year: '2004' },
    });
    expect(patchFromDraft(person, draft)).toEqual({
      names: { en: 'Abdul Karim', bn: 'আব্দুল করিম' },
      nickname: undefined,
      gender: 'male',
      isLiving: false,
      birth: { date: { year: 1931, month: 4 }, place: 'Shibganj' },
      death: { date: { year: 2004, approximate: true } },
    });
  });

  it('reads Bangla digits, clears empty dates and drops the death of a living person', () => {
    const draft = draftFromPerson(person);
    const patch = patchFromDraft(person, {
      ...draft,
      nameEn: ' ',
      isLiving: true,
      birth: { day: '৫', month: '৪', year: '১৯৩১' },
    });
    expect(patch.names).toEqual({ bn: 'আব্দুল করিম' });
    expect(patch.birth).toEqual({ date: { year: 1931, month: 4, day: 5 }, place: 'Shibganj' });
    expect(patch.death).toBeUndefined();
    expect(dateFromDraft({ day: '', month: '', year: '' })).toBeUndefined();
    expect(dateFromDraft({ day: '', month: '3', year: '' })?.year).toBeNaN();
    expect(toAsciiDigits('১৯৫২ সাল')).toBe('1952 সাল');
  });
});
