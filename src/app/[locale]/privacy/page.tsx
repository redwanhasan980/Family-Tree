import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { AppName } from '@/components/app/AppName';
import { SiteFooter, SiteHeader } from '@/features/landing/SiteChrome';
import { routing, type Locale } from '@/i18n/routing';
import { localizedUrls } from '@/lib/site';

import type { Metadata } from 'next';

type Props = { params: Promise<{ locale: Locale }> };

const SECTIONS = ['what', 'where', 'who', 'guests', 'noTracking', 'control', 'changes'] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'privacy' });
  const urls = localizedUrls('/privacy');
  return {
    title: t('title'),
    description: t('description'),
    alternates: { canonical: urls[locale], languages: urls },
  };
}

/**
 * Privacy (P8-04, NFR-PRIV-02): what is stored and where, who sees it, guest data and its
 * retention (AUTH-14), no tracking, and how to export or delete everything.
 */
export default async function PrivacyPage({ params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'privacy' });
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <SiteHeader locale={locale} />
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        <h1 className="mb-3 text-3xl font-bold sm:text-4xl">{t('title')}</h1>
        <p className="mb-8 text-lg text-muted-foreground">
          {t.rich('intro', { app: () => <AppName /> })}
        </p>
        <div className="space-y-6">
          {SECTIONS.map((key) => (
            <section key={key} aria-labelledby={`privacy-${key}`}>
              <h2 id={`privacy-${key}`} className="mb-2 text-xl font-semibold">
                {t(`sections.${key}.title`)}
              </h2>
              <p className="text-muted-foreground">{t(`sections.${key}.body`)}</p>
            </section>
          ))}
        </div>
        <p className="mt-10 text-sm text-muted-foreground">{t('updated')}</p>
      </main>
      <SiteFooter locale={locale} />
    </div>
  );
}
