import { ChevronDownIcon } from 'lucide-react';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { SiteFooter, SiteHeader } from '@/features/landing/SiteChrome';
import { routing, type Locale } from '@/i18n/routing';
import { localizedUrls } from '@/lib/site';

import type { Metadata } from 'next';

type Props = { params: Promise<{ locale: Locale }> };

const QUESTIONS = [
  'account',
  'add',
  'children',
  'languages',
  'marriages',
  'existing',
  'move',
  'undo',
  'views',
  'share',
  'backup',
  'delete',
] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'help' });
  const urls = localizedUrls('/help');
  return {
    title: t('title'),
    description: t('intro'),
    alternates: { canonical: urls[locale], languages: urls },
  };
}

/** Help (P8-04, ONB-05): the common questions, each opening its answer. No script needed. */
export default async function HelpPage({ params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'help' });
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <SiteHeader locale={locale} />
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        <h1 className="mb-3 text-3xl font-bold sm:text-4xl">{t('title')}</h1>
        <p className="mb-8 text-lg text-muted-foreground">{t('intro')}</p>
        <div className="space-y-3">
          {QUESTIONS.map((key) => (
            <details key={key} className="group rounded-2xl border bg-card">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-5 py-3 text-lg font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
                {t(`questions.${key}.q`)}
                <ChevronDownIcon
                  aria-hidden
                  className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
                />
              </summary>
              <p className="px-5 pb-5 text-muted-foreground">{t(`questions.${key}.a`)}</p>
            </details>
          ))}
        </div>
      </main>
      <SiteFooter locale={locale} />
    </div>
  );
}
