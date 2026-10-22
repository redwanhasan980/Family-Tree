import { describe, expect, it } from 'vitest';

import { ProfileSettingsSchema, ResetPasswordSchema, SignInSchema, SignUpSchema } from './forms';

function messages(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.success ? [] : (result.error?.issues.map((i) => i.message) ?? []);
}

describe('SignUpSchema', () => {
  it('accepts a valid sign-up with an optional Bangla name', () => {
    const result = SignUpSchema.safeParse({
      displayName: 'রহিম',
      email: ' a@b.co ',
      password: 'longenough',
    });
    expect(result.success).toBe(true);
    expect(result.data?.email).toBe('a@b.co');
  });

  it('accepts an empty name', () => {
    expect(
      SignUpSchema.safeParse({ displayName: '', email: 'a@b.co', password: 'longenough' }).success,
    ).toBe(true);
  });

  it('reports i18n keys for invalid input', () => {
    expect(messages(SignUpSchema.safeParse({ email: 'nope', password: 'short' }))).toEqual(
      expect.arrayContaining(['emailInvalid', 'passwordTooShort']),
    );
    expect(messages(SignUpSchema.safeParse({ email: '', password: '' }))).toEqual(
      expect.arrayContaining(['emailRequired', 'passwordRequired']),
    );
    expect(
      messages(SignUpSchema.safeParse({ email: 'a@b.co', password: 'x'.repeat(129) })),
    ).toEqual(['passwordTooLong']);
    expect(
      messages(
        SignUpSchema.safeParse({
          displayName: 'x'.repeat(81),
          email: 'a@b.co',
          password: 'longenough',
        }),
      ),
    ).toEqual(['displayNameTooLong']);
  });
});

describe('SignInSchema', () => {
  it('requires a password but not a minimum length', () => {
    expect(SignInSchema.safeParse({ email: 'a@b.co', password: 'abc' }).success).toBe(true);
    expect(messages(SignInSchema.safeParse({ email: 'a@b.co', password: '' }))).toEqual([
      'passwordRequired',
    ]);
  });
});

describe('ResetPasswordSchema', () => {
  it('validates the email', () => {
    expect(ResetPasswordSchema.safeParse({ email: 'a@b.co' }).success).toBe(true);
    expect(messages(ResetPasswordSchema.safeParse({ email: 'x' }))).toEqual(['emailInvalid']);
  });
});

describe('ProfileSettingsSchema', () => {
  it('validates name, locale and theme', () => {
    expect(
      ProfileSettingsSchema.safeParse({ displayName: 'Nadia', locale: 'bn', theme: 'dark' })
        .success,
    ).toBe(true);
    expect(
      ProfileSettingsSchema.safeParse({ displayName: ' ', locale: 'fr', theme: 'blue' }).success,
    ).toBe(false);
  });
});
