import { z } from 'zod';

import { nameFromText } from './names';
import { LIMITS, type NewPersonInput } from './schemas';
import { toAsciiDigits } from './text';

import type { Gender, LifeEvent, PartialDate, Person, PersonDetails } from './types';

/**
 * The quick "add a person" form (PER-01): one name box, in either language, and man or
 * woman. Everything else is added later in the person's details.
 */
export const QuickPersonFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, { error: 'nameRequired' })
      .max(LIMITS.personName, { error: 'nameTooLong' }),
    // An unchecked radio group is null.
    gender: z.enum(['male', 'female']).nullish(),
  })
  .refine((form) => form.gender, { error: 'genderRequired', path: ['gender'] });
export type QuickPersonForm = z.input<typeof QuickPersonFormSchema>;

export function quickPersonInput(form: z.output<typeof QuickPersonFormSchema>): NewPersonInput {
  return { names: nameFromText(form.name), gender: form.gender ?? 'unknown' };
}

/** A partial date as typed: day, month (1–12 or empty) and year, all as text. */
export interface DateDraft {
  day: string;
  month: string;
  year: string;
}

/** The person details form (P4-08, PER-04/05) as text fields. */
export interface DetailsDraft {
  nameEn: string;
  nameBn: string;
  nickname: string;
  gender: Gender;
  isLiving: boolean;
  birth: DateDraft;
  death: DateDraft;
}

const dateDraft = (date: PartialDate | undefined): DateDraft => ({
  day: date?.day ? String(date.day) : '',
  month: date?.month ? String(date.month) : '',
  year: date ? String(date.year) : '',
});

export function draftFromPerson(person: Person): DetailsDraft {
  return {
    nameEn: person.names.en ?? '',
    nameBn: person.names.bn ?? '',
    nickname: person.nickname ?? '',
    gender: person.gender,
    isLiving: person.isLiving,
    birth: dateDraft(person.birth?.date),
    death: dateDraft(person.death?.date),
  };
}

const number = (text: string): number | undefined => {
  const clean = toAsciiDigits(text).trim();
  return clean ? Number(clean) : undefined;
};

/**
 * A typed date as a partial date. Empty is no date; a day or month without a year gives
 * a date without a year, which the schema rejects with `yearOutOfRange`.
 */
export function dateFromDraft(draft: DateDraft, approximate?: boolean): PartialDate | undefined {
  const year = number(draft.year);
  const month = number(draft.month);
  const day = number(draft.day);
  if (year === undefined && month === undefined && day === undefined) return undefined;
  return {
    year: year ?? Number.NaN,
    ...(month !== undefined && { month }),
    ...(day !== undefined && { day }),
    ...(approximate && { approximate }),
  };
}

function event(current: LifeEvent | undefined, date: PartialDate | undefined) {
  const next = { ...current, date };
  if (!date) delete next.date;
  return next.date || next.place ? next : undefined;
}

/** The details to save from the form, keeping fields the form doesn't show (places). */
export function patchFromDraft(person: Person, draft: DetailsDraft): Partial<PersonDetails> {
  return {
    names: {
      ...(draft.nameEn.trim() && { en: draft.nameEn }),
      ...(draft.nameBn.trim() && { bn: draft.nameBn }),
    },
    nickname: draft.nickname.trim() ? draft.nickname : undefined,
    gender: draft.gender,
    isLiving: draft.isLiving,
    birth: event(person.birth, dateFromDraft(draft.birth, person.birth?.date?.approximate)),
    death: draft.isLiving
      ? event(person.death, undefined)
      : event(person.death, dateFromDraft(draft.death, person.death?.date?.approximate)),
  };
}
