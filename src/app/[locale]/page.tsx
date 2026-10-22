import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';

import { AppName } from '@/components/app/AppName';
import { LanguageSwitch } from '@/components/app/LanguageSwitch';
import { ThemeToggle } from '@/components/app/ThemeToggle';
import { Button } from '@/components/ui/button';
import { type Locale } from '@/i18n/routing';
import { APP_NAME } from '@/lib/brand';

// Placeholder landing page (P0-12). The real landing page arrives in P8-01.
export default function LandingPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations('landing');

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <span className="flex items-center gap-2 text-xl">
          <span aria-hidden>🌳</span>
          <AppName />
        </span>
        <div className="flex items-center gap-1">
          <LanguageSwitch />
          <ThemeToggle />
        </div>
      </header>

      <main
        id="main"
        className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center sm:px-6"
      >
        <h1 className="text-4xl leading-tight font-bold sm:text-5xl">{t('tagline')}</h1>
        <p className="max-w-xl text-lg text-muted-foreground">{t('description')}</p>
        <div className="flex flex-col items-center gap-2">
          <Button size="lg" className="h-12 rounded-full px-8 text-base" disabled>
            {t('cta')}
          </Button>
          <p className="text-sm text-muted-foreground">{t('ctaNote')}</p>
        </div>
        <p className="rounded-lg bg-surface-muted px-4 py-2 text-sm">
          {t('comingSoon', { appName: APP_NAME })}
        </p>
      </main>
    </div>
  );
}
