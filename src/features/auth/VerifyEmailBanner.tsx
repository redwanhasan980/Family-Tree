'use client';

import { MailIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { authErrorKey } from '@/lib/domain/auth/errors';
import type { Locale } from '@/lib/domain/types';
import { logger } from '@/lib/logger';
import { refreshVerification, resendVerificationEmail } from '@/lib/repositories/auth';

import { useSession } from './SessionProvider';

/** Reminds email sign-ups to confirm their address (AUTH-08). */
export function VerifyEmailBanner() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const { session } = useSession();
  const [sending, setSending] = useState(false);
  const needsVerification =
    session.status === 'registered' &&
    !session.user.emailVerified &&
    session.user.providerIds.includes('password');

  // Pick up a verification done in another tab or from the email link.
  useEffect(() => {
    if (!needsVerification) return;
    const check = () => {
      refreshVerification().catch((error: unknown) =>
        logger.warn('auth.verify_refresh', { code: authErrorKey(error) }),
      );
    };
    window.addEventListener('focus', check);
    return () => window.removeEventListener('focus', check);
  }, [needsVerification]);

  if (!needsVerification) return null;

  const resend = async () => {
    setSending(true);
    try {
      await resendVerificationEmail(locale);
      toast.success(t('verifyEmail.resent'));
    } catch (error) {
      toast.error(t(`authErrors.${authErrorKey(error)}`));
    } finally {
      setSending(false);
    }
  };

  return (
    <div role="status" className="border-b border-highlight/50 bg-highlight/15">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 text-sm sm:px-6">
        <MailIcon className="size-4 shrink-0" aria-hidden />
        <p className="min-w-0 flex-1">
          <span className="font-medium">{t('verifyEmail.title')}.</span>{' '}
          {t('verifyEmail.body', { email: session.user.email ?? '' })}
        </p>
        <Button size="sm" variant="outline" onClick={() => void resend()} disabled={sending}>
          {t('verifyEmail.resend')}
        </Button>
      </div>
    </div>
  );
}
