import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

export default function NotFound() {
  const t = useTranslations('errors');

  return (
    <main
      id="main"
      className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center"
    >
      <h1 className="text-3xl font-bold">{t('notFoundTitle')}</h1>
      <p className="text-muted-foreground">{t('notFoundBody')}</p>
      <Button asChild>
        <Link href="/">{t('goHome')}</Link>
      </Button>
    </main>
  );
}
