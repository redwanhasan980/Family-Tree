import { getTranslations, setRequestLocale } from 'next-intl/server';
import { use } from 'react';

import { EditorShell } from '@/features/editor/shell/EditorShell';
import { type Locale } from '@/i18n/routing';

import type { Metadata } from 'next';

type Props = { params: Promise<{ locale: Locale; treeId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'editor' });
  // The tree's name is only known in the browser, which sets the title once it loads.
  return { title: t('title'), robots: { index: false } };
}

export default function Page({ params }: Props) {
  const { locale, treeId } = use(params);
  setRequestLocale(locale);
  return <EditorShell treeId={treeId} />;
}
