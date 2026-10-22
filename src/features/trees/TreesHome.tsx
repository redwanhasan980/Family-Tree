'use client';

import { SproutIcon, UserRoundIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { useSession } from '@/features/auth/SessionProvider';
import { Link } from '@/i18n/navigation';
import { APP_NAME } from '@/lib/brand';

/** Placeholder dashboard until trees arrive in Phase 2 (P2-xx replaces it). */
export function TreesHome() {
  const t = useTranslations();
  const { session } = useSession();

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-3xl font-bold">{t('trees.title')}</h1>

      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-card p-8 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-highlight/20">
          <SproutIcon className="size-7" aria-hidden />
        </span>
        <p className="max-w-md text-muted-foreground">{t('trees.empty')}</p>
      </div>

      {session.status === 'guest' && (
        <section
          aria-labelledby="guest-notice"
          className="flex flex-col gap-4 rounded-2xl border border-highlight/50 bg-highlight/10 p-5 sm:flex-row sm:items-center"
        >
          <UserRoundIcon className="size-8 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1 space-y-1">
            <h2 id="guest-notice" className="font-semibold">
              {t('guest.title', { appName: APP_NAME })}
            </h2>
            <p className="text-sm text-muted-foreground">{t('guest.body')}</p>
          </div>
          <Button asChild className="shrink-0">
            <Link href="/signup">{t('guest.cta')}</Link>
          </Button>
        </section>
      )}
    </div>
  );
}
