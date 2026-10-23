'use client';

import { useTranslations } from 'next-intl';

import { authErrorKey } from '@/lib/domain/auth/errors';
import { ApiError } from '@/lib/repositories/api';

import { GuestMergeError } from './guestMerge';

/** Turns Zod issue keys (validation namespace) into translated text. */
export function useValidationText(): (key: string | undefined) => string | undefined {
  const t = useTranslations('validation');
  return (key) => {
    if (!key) return undefined;
    return t.has(key as never) ? t(key as never) : t('invalid');
  };
}

/** Turns any sign-in failure into translated, user-friendly text. */
export function useAuthErrorText(): (error: unknown) => string {
  const t = useTranslations();
  return (error) =>
    error instanceof GuestMergeError
      ? t('merge.prepareFailed')
      : t(`authErrors.${authErrorKey(error)}`);
}

/** Turns a failed call to our API (`ApiError`) into translated text. */
export function useApiErrorText(): (error: unknown) => string {
  const t = useTranslations('apiErrors');
  return (error) => {
    const code = error instanceof ApiError ? error.code : '';
    return t.has(code as never) ? t(code as never) : t('unknown');
  };
}
