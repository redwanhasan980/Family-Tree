'use client';

import { UserRoundIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Link } from '@/i18n/navigation';
import { APP_NAME } from '@/lib/brand';

/** Header chip that explains guest storage and invites sign-up (AUTH-03). */
export function GuestChip() {
  const t = useTranslations('guest');

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-highlight/60 bg-highlight/15 px-3 text-sm text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <UserRoundIcon className="size-4" aria-hidden />
          {t('chip')}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <p className="font-semibold">{t('title', { appName: APP_NAME })}</p>
        <p className="text-sm text-muted-foreground">{t('body')}</p>
        <p className="text-xs text-muted-foreground">{t('retention')}</p>
        <Button asChild className="w-full">
          <Link href="/signup">{t('cta')}</Link>
        </Button>
        <Link
          href="/login"
          className="block text-center text-sm text-primary underline-offset-4 hover:underline"
        >
          {t('haveAccount')}
        </Link>
      </PopoverContent>
    </Popover>
  );
}
