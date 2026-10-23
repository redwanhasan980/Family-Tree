'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Link, useRouter } from '@/i18n/navigation';
import { SignInSchema, type SignInInput } from '@/lib/domain/auth/forms';
import { signInWithEmail } from '@/lib/repositories/auth';

import { AuthCard } from './AuthCard';
import { FormError, FormField, PasswordField } from './FormField';
import { GoogleButton } from './GoogleButton';
import { prepareGuestMerge } from './guestMerge';
import { useSession } from './SessionProvider';
import { useAuthErrorText, useValidationText } from './useMessages';

/** Log in to an existing account (AUTH-06). A guest's trees can then be moved across. */
export function LoginForm() {
  const t = useTranslations('auth');
  const router = useRouter();
  const { markSignedIn } = useSession();
  const validation = useValidationText();
  const errorText = useAuthErrorText();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInInput>({
    resolver: zodResolver(SignInSchema),
    defaultValues: { email: '', password: '' },
  });

  const done = () => {
    toast.success(t('welcomeBack'));
    router.replace('/trees');
  };

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      markSignedIn();
      // A guest with trees gets a merge ticket first (AUTH-06).
      await signInWithEmail(values.email, values.password, { beforeSwitch: prepareGuestMerge });
      done();
    } catch (error) {
      markSignedIn(false);
      setFormError(errorText(error));
    }
  });

  return (
    <AuthCard title={t('logInTitle')} subtitle={t('logInSubtitle')}>
      <GoogleButton
        onStart={markSignedIn}
        onDone={done}
        onError={(message) => {
          markSignedIn(false);
          setFormError(message);
        }}
      />
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span className="h-px flex-1 bg-border" /> {t('or')}{' '}
        <span className="h-px flex-1 bg-border" />
      </div>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
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
          autoComplete="current-password"
          error={validation(errors.password?.message)}
          {...register('password')}
        />
        <div className="text-right">
          <Link
            href="/reset-password"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            {t('forgotPassword')}
          </Link>
        </div>
        <FormError message={formError} />
        <Button type="submit" className="h-11 w-full text-base" disabled={isSubmitting}>
          {isSubmitting ? t('working') : t('logInSubmit')}
        </Button>
      </form>
      <p className="text-center text-sm">
        {t('noAccount')}{' '}
        <Link
          href="/signup"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {t('signUpTitle')}
        </Link>
      </p>
    </AuthCard>
  );
}
