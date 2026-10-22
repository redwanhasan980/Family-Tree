import { z } from 'zod';

/** Field limits shared by forms, security rules and the server (SRS §6.2). */
export const LIMITS = {
  displayName: 80,
  email: 254,
  passwordMin: 8,
  passwordMax: 128,
} as const;

export const LocaleSchema = z.enum(['bn', 'en']);
export const ThemePreferenceSchema = z.enum(['system', 'light', 'dark']);

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
