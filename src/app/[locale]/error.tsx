'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errors');

  useEffect(() => {
    // Replaced by the PII-scrubbing logger in P8-10.
    console.error(error);
  }, [error]);

  return (
    <main
      id="main"
      className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center"
    >
      <h1 className="text-3xl font-bold">{t('genericTitle')}</h1>
      <p className="max-w-md text-muted-foreground">{t('genericBody')}</p>
      <Button onClick={reset}>{t('retry')}</Button>
    </main>
  );
}
