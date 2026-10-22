import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';

import { AppName } from '@/components/app/AppName';
import { LanguageSwitch } from '@/components/app/LanguageSwitch';
import { ThemeToggle } from '@/components/app/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';

// Placeholder landing page (P0-12). The real landing page arrives in P8-01. It never
// creates a guest: that happens when the visitor enters the app (DESIGN §9.2).
export default function LandingPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations('landing');

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-2 px-4 py-3 sm:px-6">
        <span className="flex items-center gap-2 text-xl">
          <span aria-hidden>🌳</span>
          <AppName />
        </span>
        <div className="flex items-center gap-1">
          <LanguageSwitch compact />
          <ThemeToggle />
          <Button asChild variant="ghost" className="h-11 px-2 sm:px-3">
            <Link href="/login">{t('logIn')}</Link>
          </Button>
        </div>
      </header>

      <main
        id="main"
        className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center sm:px-6"
      >
        <h1 className="text-4xl leading-tight font-bold sm:text-5xl">{t('tagline')}</h1>
        <p className="max-w-xl text-lg text-muted-foreground">{t('description')}</p>
        <div className="flex flex-col items-center gap-2">
          <Button asChild size="lg" className="h-12 rounded-full px-8 text-base">
            <Link href="/trees">{t('cta')}</Link>
          </Button>
          <p className="text-sm text-muted-foreground">{t('ctaNote')}</p>
        </div>
        <p className="rounded-lg bg-surface-muted px-4 py-2 text-sm">{t('comingSoon')}</p>
      </main>
    </div>
  );
}
