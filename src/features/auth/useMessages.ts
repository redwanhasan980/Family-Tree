'use client';

import { useTranslations } from 'next-intl';

import { authErrorKey } from '@/lib/domain/auth/errors';

/** Turns Zod issue keys (validation namespace) into translated text. */
export function useValidationText(): (key: string | undefined) => string | undefined {
  const t = useTranslations('validation');
  return (key) => {
    if (!key) return undefined;
    return t.has(key as never) ? t(key as never) : t('emailInvalid');
  };
}

/** Turns any Firebase Auth error into translated, user-friendly text. */
export function useAuthErrorText(): (error: unknown) => string {
  const t = useTranslations('authErrors');
  return (error) => t(authErrorKey(error));
}
