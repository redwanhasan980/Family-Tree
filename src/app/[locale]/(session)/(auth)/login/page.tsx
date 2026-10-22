import { getTranslations, setRequestLocale } from 'next-intl/server';
import { use } from 'react';

import { LoginForm } from '@/features/auth/LoginForm';
import { RegisteredRedirect } from '@/features/auth/RegisteredRedirect';
import { type Locale } from '@/i18n/routing';

import type { Metadata } from 'next';

type Props = { params: Promise<{ locale: Locale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth' });
  return { title: t('logInTitle') };
}

export default function Page({ params }: Props) {
  const { locale } = use(params);
  setRequestLocale(locale);
  return (
    <RegisteredRedirect>
      <LoginForm />
    </RegisteredRedirect>
  );
}
