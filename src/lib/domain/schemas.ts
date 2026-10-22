import { z } from 'zod';

import { isValidId } from './ids';

/** Field limits shared by forms, security rules and the server (SRS §6.2). */
export const LIMITS = {
  displayName: 80,
  email: 254,
  passwordMin: 8,
  passwordMax: 128,
  personName: 120,
  nickname: 60,
  /** Profession, education and places. */
  shortText: 120,
  address: 300,
  description: 2000,
  phones: 3,
  phone: 30,
  customFields: 20,
  customLabel: 40,
  customValue: 300,
  minYear: 1000,
  treeName: 80,
  treeDescription: 500,
  /** Warn above this many people in a tree. */
  personsSoftLimit: 2000,
  personsHardLimit: 5000,
  treesPerUser: 50,
  membersPerTree: 50,
} as const;

/** Latest year a date may have: next year, for a baby on the way. */
export function maxYear(now: Date = new Date()): number {
  return now.getUTCFullYear() + 1;
}

export const LocaleSchema = z.enum(['bn', 'en']);
export const ThemePreferenceSchema = z.enum(['system', 'light', 'dark']);
export const GenderSchema = z.enum(['male', 'female', 'unknown']);
export const RoleSchema = z.enum(['owner', 'editor', 'viewer']);
export const ViewKindSchema = z.enum(['tree', 'family', 'circle', 'list', 'album', 'timeline']);
export const ParentKindSchema = z.enum(['biological', 'adoptive', 'step', 'foster']);
export const SpouseStatusSchema = z.enum(['married', 'divorced', 'separated', 'widowed']);
export const IdSchema = z.string().refine(isValidId, { error: 'invalid' });

// Validation messages are i18n keys in the `validation` namespace.
export const EmailSchema = z
  .string()
  .trim()
  .min(1, { error: 'emailRequired' })
  .max(LIMITS.email, { error: 'emailInvalid' })
  .pipe(z.email({ error: 'emailInvalid' }));

export const PasswordSchema = z
  .string()
  .min(1, { error: 'passwordRequired' })
  .min(LIMITS.passwordMin, { error: 'passwordTooShort' })
  .max(LIMITS.passwordMax, { error: 'passwordTooLong' });

export const DisplayNameSchema = z
  .string()
  .trim()
  .min(1, { error: 'displayNameRequired' })
  .max(LIMITS.displayName, { error: 'displayNameTooLong' });

/** Optional text: trimmed, and an empty value means "not set". */
function optionalText(max: number, error = 'textTooLong') {
  return z
    .string()
    .trim()
    .max(max, { error })
    .optional()
    .transform((value) => (value ? value : undefined));
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Year only, year and month, or a full date (SRS §6.2). */
export const PartialDateSchema = z
  .object({
    year: z.int({ error: 'yearOutOfRange' }),
    month: z
      .int({ error: 'monthInvalid' })
      .min(1, { error: 'monthInvalid' })
      .max(12, { error: 'monthInvalid' })
      .optional(),
    day: z.int({ error: 'dayInvalid' }).min(1, { error: 'dayInvalid' }).optional(),
    approximate: z.boolean().optional(),
  })
  .check((ctx) => {
    const { year, month, day } = ctx.value;
    if (year < LIMITS.minYear || year > maxYear()) {
      ctx.issues.push({ code: 'custom', message: 'yearOutOfRange', path: ['year'], input: year });
    }
    if (day !== undefined && month === undefined) {
      ctx.issues.push({
        code: 'custom',
        message: 'dayWithoutMonth',
        path: ['month'],
        input: month,
      });
    } else if (day !== undefined && month !== undefined && day > daysInMonth(year, month)) {
      ctx.issues.push({ code: 'custom', message: 'dayInvalid', path: ['day'], input: day });
    }
  });

/** English and/or Bangla name; at least one is required (PER-01, I18N-03). */
export const LocalizedNameSchema = z
  .object({
    en: optionalText(LIMITS.personName, 'nameTooLong'),
    bn: optionalText(LIMITS.personName, 'nameTooLong'),
  })
  .refine((name) => Boolean(name.en || name.bn), { error: 'nameRequired', path: ['en'] });

export const LifeEventSchema = z.object({
  date: PartialDateSchema.optional(),
  place: optionalText(LIMITS.shortText),
});

export const PhotoRefSchema = z.object({
  publicId: z.string().regex(/^shikor\/[a-z]+\/[A-Za-z0-9]+\/[A-Za-z0-9]+\/[A-Za-z0-9_-]+$/),
  version: z.int().positive(),
  width: z.int().positive(),
  height: z.int().positive(),
});

export const PhoneSchema = z
  .string()
  .trim()
  .min(1, { error: 'phoneInvalid' })
  .max(LIMITS.phone, { error: 'phoneInvalid' })
  .regex(/^[+0-9 \-()]+$/, { error: 'phoneInvalid' });

export const CustomFieldSchema = z.object({
  id: z.string().min(1).max(40),
  label: z
    .string()
    .trim()
    .min(1, { error: 'customLabelRequired' })
    .max(LIMITS.customLabel, { error: 'textTooLong' }),
  value: z.string().trim().max(LIMITS.customValue, { error: 'textTooLong' }),
});

/** Everything a person's details form can submit (PER-01..03). */
export const PersonDetailsSchema = z.object({
  names: LocalizedNameSchema,
  nickname: optionalText(LIMITS.nickname, 'nicknameTooLong'),
  gender: GenderSchema,
  isLiving: z.boolean(),
  birth: LifeEventSchema.optional(),
  death: LifeEventSchema.optional(),
  profession: optionalText(LIMITS.shortText),
  education: optionalText(LIMITS.shortText),
  addresses: z
    .object({
      present: optionalText(LIMITS.address),
      permanent: optionalText(LIMITS.address),
    })
    .optional(),
  phones: z.array(PhoneSchema).max(LIMITS.phones, { error: 'tooManyPhones' }).optional(),
  email: z
    .string()
    .trim()
    .max(LIMITS.email, { error: 'emailInvalid' })
    .optional()
    .transform((value) => (value ? value : undefined))
    .pipe(z.email({ error: 'emailInvalid' }).optional()),
  description: optionalText(LIMITS.description, 'descriptionTooLong'),
  photo: PhotoRefSchema.nullable().optional(),
  customFields: z
    .array(CustomFieldSchema)
    .max(LIMITS.customFields, { error: 'tooManyCustomFields' })
    .optional(),
  childOrder: z.number().finite().optional(),
});
export type PersonDetailsInput = z.input<typeof PersonDetailsSchema>;

/** The minimum needed to add someone: a name and a gender (PER-01). */
export const NewPersonSchema = PersonDetailsSchema.pick({ names: true, gender: true }).extend({
  isLiving: z.boolean().default(true),
});
export type NewPersonInput = z.input<typeof NewPersonSchema>;

export const TreeSettingsSchema = z.object({
  nameDisplay: z.enum(['auto', 'en', 'bn', 'both']),
  colorBy: z.enum(['branch', 'gender', 'generation', 'none']),
  showPhotos: z.boolean(),
  showDates: z.boolean(),
  defaultView: ViewKindSchema,
  kinshipStyle: z.enum(['bd', 'wb']),
});

export const DEFAULT_TREE_SETTINGS = {
  nameDisplay: 'auto',
  colorBy: 'branch',
  showPhotos: true,
  showDates: true,
  defaultView: 'tree',
  kinshipStyle: 'bd',
} as const satisfies z.infer<typeof TreeSettingsSchema>;

/** Name and description a user gives a tree (TREE-01, TREE-03). */
export const TreeDetailsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: 'treeNameRequired' })
    .max(LIMITS.treeName, { error: 'treeNameTooLong' }),
  description: optionalText(LIMITS.treeDescription),
});
export type TreeDetailsInput = z.input<typeof TreeDetailsSchema>;
