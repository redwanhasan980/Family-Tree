import { getTranslations, setRequestLocale } from 'next-intl/server';
import { use } from 'react';

import { TreesHome } from '@/features/trees/TreesHome';
import { type Locale } from '@/i18n/routing';

import type { Metadata } from 'next';

type Props = { params: Promise<{ locale: Locale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'trees' });
  return { title: t('title') };
}

export default function Page({ params }: Props) {
  const { locale } = use(params);
  setRequestLocale(locale);
  return <TreesHome />;
}
