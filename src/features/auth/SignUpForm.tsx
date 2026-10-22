'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Link, useRouter } from '@/i18n/navigation';
import { authErrorKey } from '@/lib/domain/auth/errors';
import { SignUpSchema, type SignUpInput } from '@/lib/domain/auth/forms';
import type { Locale } from '@/lib/domain/types';
import { signUpWithEmail } from '@/lib/repositories/auth';

import { AuthCard } from './AuthCard';
import { FormError, FormField, PasswordField } from './FormField';
import { GoogleButton } from './GoogleButton';
import { useAuthErrorText, useValidationText } from './useMessages';

/** Sign-up links email/password or Google to the current guest, keeping everything (AUTH-04/05). */
export function SignUpForm() {
  const t = useTranslations('auth');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const validation = useValidationText();
  const errorText = useAuthErrorText();
  const [formError, setFormError] = useState<string | null>(null);
  const [emailInUse, setEmailInUse] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpInput>({
    resolver: zodResolver(SignUpSchema),
    defaultValues: { displayName: '', email: '', password: '' },
  });

  const done = () => {
    toast.success(t('signedUp'));
    router.replace('/trees');
  };

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    setEmailInUse(false);
    try {
      await signUpWithEmail(
        {
          email: values.email,
          password: values.password,
          displayName: values.displayName || undefined,
        },
        locale,
      );
      done();
    } catch (error) {
      setEmailInUse(authErrorKey(error) === 'emailInUse');
      setFormError(errorText(error));
    }
  });

  return (
    <AuthCard title={t('signUpTitle')} subtitle={t('signUpSubtitle')}>
      <GoogleButton onDone={done} onError={setFormError} />
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span className="h-px flex-1 bg-border" /> {t('or')}{' '}
        <span className="h-px flex-1 bg-border" />
      </div>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormField
          label={t('nameLabel')}
          autoComplete="name"
          error={validation(errors.displayName?.message)}
          {...register('displayName')}
        />
        <FormField
          label={t('emailLabel')}
          type="email"
          inputMode="email"
          autoComplete="email"
          error={validation(errors.email?.message)}
          {...register('email')}
        />
        <PasswordField
          label={t('passwordLabel')}
          autoComplete="new-password"
          hint={t('passwordHint')}
          error={validation(errors.password?.message)}
          {...register('password')}
        />
        <FormError message={formError} />
        {emailInUse && (
          <Button asChild variant="link" className="h-auto p-0">
            <Link href="/login">{t('logInTitle')}</Link>
          </Button>
        )}
        <Button type="submit" className="h-11 w-full text-base" disabled={isSubmitting}>
          {isSubmitting ? t('working') : t('signUpSubmit')}
        </Button>
      </form>
      <p className="text-center text-sm">
        {t('haveAccount')}{' '}
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          {t('logInTitle')}
        </Link>
      </p>
    </AuthCard>
  );
}
