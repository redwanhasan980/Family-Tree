import { z } from 'zod';

import {
  DisplayNameSchema,
  EmailSchema,
  LocaleSchema,
  PasswordSchema,
  ThemePreferenceSchema,
} from '../schemas';

/** Sign-up links an email and password to the current guest (AUTH-04). */
export const SignUpSchema = z.object({
  displayName: z.union([DisplayNameSchema, z.literal('')]).optional(),
  email: EmailSchema,
  password: PasswordSchema,
});
export type SignUpInput = z.infer<typeof SignUpSchema>;

export const SignInSchema = z.object({
  email: EmailSchema,
  // Existing accounts may predate the length rule, so only require a value here.
  password: z.string().min(1, { error: 'passwordRequired' }),
});
export type SignInInput = z.infer<typeof SignInSchema>;

export const ResetPasswordSchema = z.object({ email: EmailSchema });
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;

export const ProfileSettingsSchema = z.object({
  displayName: DisplayNameSchema,
  locale: LocaleSchema,
  theme: ThemePreferenceSchema,
});
export type ProfileSettingsInput = z.infer<typeof ProfileSettingsSchema>;
