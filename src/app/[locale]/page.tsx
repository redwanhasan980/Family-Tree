import {
  CircleIcon,
  DownloadIcon,
  HandHeartIcon,
  LanguagesIcon,
  ListIcon,
  NetworkIcon,
  ShieldCheckIcon,
  UsersRoundIcon,
} from 'lucide-react';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Button } from '@/components/ui/button';
import { HeroTree } from '@/features/landing/HeroTree';
import { SiteFooter, SiteHeader } from '@/features/landing/SiteChrome';
import { Link } from '@/i18n/navigation';
import { routing, type Locale } from '@/i18n/routing';
import { APP_NAME } from '@/lib/brand';
import { localizedUrls } from '@/lib/site';

import type { Metadata } from 'next';

type Props = { params: Promise<{ locale: Locale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });
  const urls = localizedUrls('/');
  const title = t('title', { appName: APP_NAME });
  return {
    title: { absolute: title },
    description: t('description'),
    alternates: { canonical: urls[locale], languages: urls },
    openGraph: {
      type: 'website',
      siteName: APP_NAME,
      title,
      description: t('description'),
      url: urls[locale],
      locale: locale === 'bn' ? 'bn_BD' : 'en_US',
      images: [{ url: `/og/${locale}.png`, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: 'summary_large_image', title, description: t('description') },
  };
}

function CallToAction({ cta, note }: { cta: string; note: string }) {
  return (
    <div className="flex flex-col items-center gap-2 lg:items-start">
      <Button asChild size="lg" className="h-12 rounded-full px-8 text-base">
        <Link href="/trees">{cta}</Link>
      </Button>
      <p className="text-sm text-muted-foreground">{note}</p>
    </div>
  );
}

/**
 * The landing page (P8-01, ONB-01): what শিকড় is, one call to action, a sample family,
 * three reasons, the four views and the privacy promise. Static, with no Firebase: a
 * guest is created only when the visitor enters the app (DESIGN §9.2).
 */
export default async function LandingPage({ params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'landing' });

  const features = [
    { icon: UsersRoundIcon, title: t('features.easyTitle'), body: t('features.easyBody') },
    { icon: LanguagesIcon, title: t('features.languagesTitle'), body: t('features.languagesBody') },
    { icon: DownloadIcon, title: t('features.shareTitle'), body: t('features.shareBody') },
  ];
  const views = [
    { icon: NetworkIcon, label: t('views.tree') },
    { icon: HandHeartIcon, label: t('views.family') },
    { icon: CircleIcon, label: t('views.circle') },
    { icon: ListIcon, label: t('views.list') },
  ];
  const promises = [
    t('privacy.private'),
    t('privacy.noAds'),
    t('privacy.yours'),
    t('privacy.guest'),
  ];

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <SiteHeader locale={locale} />

      <main id="main" className="flex-1">
        <section className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 pt-8 pb-16 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:pt-16">
          <div className="flex flex-col items-center gap-6 text-center lg:items-start lg:text-left">
            <h1 className="text-4xl leading-tight font-bold text-balance sm:text-5xl">
              {t('tagline')}
            </h1>
            <p className="max-w-xl text-lg text-muted-foreground">{t('description')}</p>
            <CallToAction cta={t('cta')} note={t('ctaNote')} />
          </div>
          <div className="flex justify-center">
            <HeroTree locale={locale} />
          </div>
        </section>

        <section aria-labelledby="features" className="bg-surface-muted py-16">
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
            <h2 id="features" className="mb-8 text-center text-2xl font-semibold sm:text-3xl">
              {t('featuresTitle')}
            </h2>
            <ul className="grid gap-4 md:grid-cols-3">
              {features.map(({ icon: Icon, title, body }) => (
                <li key={title} className="rounded-2xl border bg-card p-6">
                  <Icon aria-hidden className="mb-4 size-8 text-primary" />
                  <h3 className="mb-2 text-lg font-semibold">{title}</h3>
                  <p className="text-muted-foreground">{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="views" className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <h2 id="views" className="mb-3 text-center text-2xl font-semibold sm:text-3xl">
            {t('viewsTitle')}
          </h2>
          <p className="mx-auto mb-8 max-w-2xl text-center text-muted-foreground">
            {t('viewsBody')}
          </p>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {views.map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="flex flex-col items-center gap-2 rounded-2xl border bg-card px-3 py-5"
              >
                <Icon aria-hidden className="size-7 text-primary" />
                <span className="font-medium">{label}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="privacy" className="bg-surface-muted py-16">
          <div className="mx-auto grid w-full max-w-4xl gap-6 px-4 sm:px-6">
            <h2
              id="privacy"
              className="flex items-center justify-center gap-3 text-2xl font-semibold sm:text-3xl"
            >
              <ShieldCheckIcon aria-hidden className="size-8 shrink-0 text-primary" />
              {t('privacyTitle')}
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {promises.map((promise) => (
                <li key={promise} className="rounded-2xl border bg-card p-5">
                  {promise}
                </li>
              ))}
            </ul>
            <p className="text-center">
              <Link
                href="/privacy"
                className="font-medium text-primary underline underline-offset-4"
              >
                {t('privacyLink')}
              </Link>
            </p>
          </div>
        </section>

        <section className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4 px-4 py-16 text-center sm:px-6">
          <h2 className="text-2xl font-semibold sm:text-3xl">{t('finalTitle')}</h2>
          <p className="text-lg text-muted-foreground">{t('finalBody')}</p>
          <div className="lg:[&>div]:items-center">
            <CallToAction cta={t('cta')} note={t('ctaNote')} />
          </div>
        </section>
      </main>

      <SiteFooter locale={locale} />
    </div>
  );
}
