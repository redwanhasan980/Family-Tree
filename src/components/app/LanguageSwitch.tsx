'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';

import { usePathname, useRouter } from '@/i18n/navigation';
import { routing, type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

// Each language is labelled in its own script, so the switch is readable in either locale.
const LABELS: Record<Locale, string> = { bn: 'বাংলা', en: 'English' };
const COMPACT_LABELS: Record<Locale, string> = { bn: 'বাংলা', en: 'EN' };

export function LanguageSwitch({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const t = useTranslations('common');
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <div
      role="group"
      aria-label={t('language')}
      className={cn('inline-flex rounded-full border bg-surface p-0.5', className)}
    >
      {routing.locales.map((value) => (
        <button
          key={value}
          type="button"
          lang={value}
          aria-pressed={value === locale}
          disabled={isPending}
          onClick={() => {
            if (value === locale) return;
            // Keep the query (the editor's ?view=&focus=); read at click time, so static
            // pages need no Suspense boundary for useSearchParams.
            const href = `${pathname}${window.location.search}`;
            startTransition(() => router.replace(href, { locale: value }));
          }}
          className={cn(
            compact
              ? 'min-h-9 min-w-11 rounded-full px-2.5 text-sm transition-colors'
              : 'min-h-9 min-w-11 rounded-full px-3 text-sm transition-colors',
            'outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
            value === locale
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
          )}
        >
          {compact ? (
            <>
              <span aria-hidden>{COMPACT_LABELS[value]}</span>
              <span className="sr-only">{LABELS[value]}</span>
            </>
          ) : (
            LABELS[value]
          )}
        </button>
      ))}
    </div>
  );
}
