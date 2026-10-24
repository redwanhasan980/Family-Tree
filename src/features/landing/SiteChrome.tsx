import { getTranslations } from 'next-intl/server';

import { AppName } from '@/components/app/AppName';
import { LanguageSwitch } from '@/components/app/LanguageSwitch';
import { ThemeToggle } from '@/components/app/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/lib/domain/types';

/** The public pages' header: name, language, theme and log in (landing, help, privacy). */
export async function SiteHeader({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'landing' });
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-4 py-3 sm:px-6">
      <Link href="/" className="flex items-center gap-2 text-xl">
        <span aria-hidden>🌳</span>
        <AppName />
      </Link>
      <div className="flex items-center gap-1">
        <LanguageSwitch compact />
        <ThemeToggle />
        <Button asChild variant="ghost" className="h-11 px-2 sm:px-3">
          <Link href="/login">{t('logIn')}</Link>
        </Button>
      </div>
    </header>
  );
}

export async function SiteFooter({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'landing' });
  return (
    <footer className="border-t">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:px-6">
        <p className="flex flex-wrap items-center justify-center gap-x-2 text-center sm:justify-start sm:text-left">
          <AppName />
          <span>{t('footerNote')}</span>
        </p>
        <nav aria-label={t('footerLinks')} className="flex gap-4">
          <Link
            href="/help"
            className="inline-flex min-h-11 items-center hover:text-foreground hover:underline"
          >
            {t('footerHelp')}
          </Link>
          <Link
            href="/privacy"
            className="inline-flex min-h-11 items-center hover:text-foreground hover:underline"
          >
            {t('footerPrivacy')}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
