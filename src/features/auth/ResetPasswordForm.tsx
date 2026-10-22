'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { MailCheckIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { ResetPasswordSchema, type ResetPasswordInput } from '@/lib/domain/auth/forms';
import type { Locale } from '@/lib/domain/types';
import { sendPasswordReset } from '@/lib/repositories/auth';

import { AuthCard } from './AuthCard';
import { FormError, FormField } from './FormField';
import { useAuthErrorText, useValidationText } from './useMessages';

/** Password reset by email (AUTH-09). The reply never reveals whether an account exists. */
export function ResetPasswordForm() {
  const t = useTranslations('auth');
  const locale = useLocale() as Locale;
  const validation = useValidationText();
  const errorText = useAuthErrorText();
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(ResetPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit(async ({ email }) => {
    setFormError(null);
    try {
      await sendPasswordReset(email, locale);
      setSent(true);
    } catch (error) {
      setFormError(errorText(error));
    }
  });

  return (
    <AuthCard title={t('resetTitle')} subtitle={sent ? undefined : t('resetSubtitle')}>
      {sent ? (
        <p role="status" className="flex gap-3 rounded-xl bg-surface-muted p-4">
          <MailCheckIcon className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
          <span>{t('resetSent')}</span>
        </p>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <FormField
            label={t('emailLabel')}
            type="email"
            inputMode="email"
            autoComplete="email"
            error={validation(errors.email?.message)}
            {...register('email')}
          />
          <FormError message={formError} />
          <Button type="submit" className="h-11 w-full text-base" disabled={isSubmitting}>
            {isSubmitting ? t('working') : t('resetSubmit')}
          </Button>
        </form>
      )}
      <p className="text-center text-sm">
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          {t('backToLogIn')}
        </Link>
      </p>
    </AuthCard>
  );
}
