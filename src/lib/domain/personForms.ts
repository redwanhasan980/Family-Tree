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

/** An extra label/value field as typed (PER-03). */
export interface CustomFieldDraft {
  id: string;
  label: string;
  value: string;
}

/** The person details form (PER-02/03/04) as text fields. */
export interface DetailsDraft {
  nameEn: string;
  nameBn: string;
  nickname: string;
  gender: Gender;
  isLiving: boolean;
  birth: DateDraft;
  birthApprox: boolean;
  birthPlace: string;
  death: DateDraft;
  deathApprox: boolean;
  deathPlace: string;
  profession: string;
  education: string;
  presentAddress: string;
  permanentAddress: string;
  /** Up to three rows; empty rows are dropped when saving. */
  phones: string[];
  email: string;
  description: string;
  customFields: CustomFieldDraft[];
}

/** A date as the three typed boxes. */
export const dateDraft = (date: PartialDate | undefined): DateDraft => ({
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
    birthApprox: Boolean(person.birth?.date?.approximate),
    birthPlace: person.birth?.place ?? '',
    death: dateDraft(person.death?.date),
    deathApprox: Boolean(person.death?.date?.approximate),
    deathPlace: person.death?.place ?? '',
    profession: person.profession ?? '',
    education: person.education ?? '',
    presentAddress: person.addresses?.present ?? '',
    permanentAddress: person.addresses?.permanent ?? '',
    phones: person.phones?.length ? [...person.phones] : [''],
    email: person.email ?? '',
    description: person.description ?? '',
    customFields: (person.customFields ?? []).map((field) => ({ ...field })),
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

const text = (value: string): string | undefined => (value.trim() ? value : undefined);

function lifeEvent(date: PartialDate | undefined, place: string): LifeEvent | undefined {
  const event: LifeEvent = {
    ...(date && { date }),
    ...(text(place) && { place }),
  };
  return event.date || event.place ? event : undefined;
}

/** Phone rows that are saved, in order (blank rows are dropped). Digits become ASCII. */
export function keptPhones(draft: Pick<DetailsDraft, 'phones'>): { row: number; phone: string }[] {
  return draft.phones.flatMap((phone, row) => {
    const clean = toAsciiDigits(phone).trim();
    return clean ? [{ row, phone: clean }] : [];
  });
}

/** Extra fields that are saved, in order (rows with neither label nor value are dropped). */
export function keptCustomFields(draft: Pick<DetailsDraft, 'customFields'>): CustomFieldDraft[] {
  return draft.customFields.filter((field) => field.label.trim() || field.value.trim());
}

/** The details to save from the form. */
export function patchFromDraft(draft: DetailsDraft): Partial<PersonDetails> {
  const present = text(draft.presentAddress);
  const permanent = text(draft.permanentAddress);
  const phones = keptPhones(draft).map((kept) => kept.phone);
  const customFields = keptCustomFields(draft);
  return {
    names: {
      ...(draft.nameEn.trim() && { en: draft.nameEn }),
      ...(draft.nameBn.trim() && { bn: draft.nameBn }),
    },
    nickname: text(draft.nickname),
    gender: draft.gender,
    isLiving: draft.isLiving,
    birth: lifeEvent(dateFromDraft(draft.birth, draft.birthApprox), draft.birthPlace),
    death: draft.isLiving
      ? undefined
      : lifeEvent(dateFromDraft(draft.death, draft.deathApprox), draft.deathPlace),
    profession: text(draft.profession),
    education: text(draft.education),
    addresses:
      present || permanent
        ? { ...(present && { present }), ...(permanent && { permanent }) }
        : undefined,
    phones: phones.length > 0 ? phones : undefined,
    email: text(draft.email)?.trim(),
    description: text(draft.description),
    customFields: customFields.length > 0 ? customFields : undefined,
  };
}

/**
 * Which form field a validation issue path (`params.field`) belongs to, using the same
 * rows as `patchFromDraft`: "phone:0" for the first phone row, "custom:{id}:label".
 */
export function draftFieldOf(path: string, draft: DetailsDraft): string | null {
  const [head, index, part] = path.split('.');
  switch (head) {
    case 'names':
      return index === 'bn' ? 'nameBn' : 'nameEn';
    case 'birth':
    case 'death':
      return index === 'place' ? `${head}Place` : head;
    case 'addresses':
      return index === 'permanent' ? 'permanentAddress' : 'presentAddress';
    case 'phones': {
      const kept = index === undefined ? undefined : keptPhones(draft)[Number(index)];
      return kept ? `phone:${kept.row}` : 'phones';
    }
    case 'customFields': {
      const kept = index === undefined ? undefined : keptCustomFields(draft)[Number(index)];
      return kept ? `custom:${kept.id}:${part === 'value' ? 'value' : 'label'}` : 'customFields';
    }
    case 'nickname':
    case 'profession':
    case 'education':
    case 'email':
    case 'description':
      return head;
    default:
      return null;
  }
}
