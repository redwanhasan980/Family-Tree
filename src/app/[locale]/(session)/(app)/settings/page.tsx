import { getTranslations, setRequestLocale } from 'next-intl/server';
import { use } from 'react';

import { SettingsForm } from '@/features/settings/SettingsForm';
import { type Locale } from '@/i18n/routing';

import type { Metadata } from 'next';

type Props = { params: Promise<{ locale: Locale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'settings' });
  return { title: t('title') };
}

export default function Page({ params }: Props) {
  const { locale } = use(params);
  setRequestLocale(locale);
  return <SettingsForm />;
}
