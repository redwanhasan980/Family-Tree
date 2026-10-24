import { z } from 'zod';

import { nameFromText } from './names';
import { LIMITS, TreeDetailsSchema, type NewPersonInput, type TreeDetailsInput } from './schemas';

/** Deleting a tree with more people than this needs its name typed (TREE-03). */
export const DELETE_CONFIRM_THRESHOLD = 10;

/** The "new tree" form: a name and, optionally, the oldest person the user remembers. */
export const CreateTreeFormSchema = z
  .object({
    name: TreeDetailsSchema.shape.name,
    rootName: z.string().trim().max(LIMITS.personName, { error: 'nameTooLong' }),
    // An unchecked radio group is null.
    rootGender: z.enum(['male', 'female']).nullish(),
  })
  .refine((form) => !form.rootName || form.rootGender, {
    error: 'genderRequired',
    path: ['rootGender'],
  });
export type CreateTreeForm = z.input<typeof CreateTreeFormSchema>;

/** The first-run wizard's question (ONB-02): the oldest ancestor's name and gender. */
export const AncestorFormSchema = z.object({
  rootName: z
    .string()
    .trim()
    .min(1, { error: 'nameRequired' })
    .max(LIMITS.personName, { error: 'nameTooLong' }),
  rootGender: z.enum(['male', 'female'], { error: 'genderRequired' }),
});
export type AncestorForm = z.input<typeof AncestorFormSchema>;

/** A tree started from the wizard: named after the ancestor, who is its first person. */
export function ancestorTreeInput(
  form: z.output<typeof AncestorFormSchema>,
  treeName: string,
): TreeDetailsInput & { root: NewPersonInput } {
  // The limit counts UTF-16 units: keep whole graphemes that fit (rule 9).
  let name = '';
  for (const { segment } of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(
    treeName,
  )) {
    if (name.length + segment.length > LIMITS.treeName) break;
    name += segment;
  }
  return {
    name,
    root: { names: nameFromText(form.rootName), gender: form.rootGender },
  };
}

/** What `createTree` needs, from the parsed form. */
export function createTreeInput(
  form: z.output<typeof CreateTreeFormSchema>,
): TreeDetailsInput & { root?: NewPersonInput } {
  if (!form.rootName || !form.rootGender) return { name: form.name };
  return { name: form.name, root: { names: nameFromText(form.rootName), gender: form.rootGender } };
}

export function needsNameToDelete(personCount: number): boolean {
  return personCount > DELETE_CONFIRM_THRESHOLD;
}

/** Whether the typed confirmation matches the tree's name (spaces and Unicode forms aside). */
export function matchesTreeName(typed: string, name: string): boolean {
  const clean = (text: string) => text.trim().replace(/\s+/g, ' ').normalize('NFC');
  return clean(typed) === clean(name);
}
