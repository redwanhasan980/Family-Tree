import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Suspense, use } from 'react';

import { Wizard } from '@/features/onboarding/Wizard';
import { type Locale } from '@/i18n/routing';

import type { Metadata } from 'next';

type Props = { params: Promise<{ locale: Locale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'onboarding' });
  return { title: t('languageTitle') };
}

/** The first-run wizard (P8-02). It reads its step from the URL, hence the Suspense. */
export default function Page({ params }: Props) {
  const { locale } = use(params);
  setRequestLocale(locale);
  return (
    <Suspense>
      <Wizard />
    </Suspense>
  );
}
