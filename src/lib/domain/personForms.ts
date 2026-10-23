import { z } from 'zod';

import { nameFromText } from './names';
import { LIMITS, type NewPersonInput } from './schemas';

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
