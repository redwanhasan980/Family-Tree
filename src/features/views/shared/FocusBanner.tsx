'use client';

import { useLocale, useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { displayName } from '@/lib/domain/names';
import type { ID, Locale } from '@/lib/domain/types';
import { cn } from '@/lib/utils';
import { useTree } from '@/stores/treeStore';
import { uiStore } from '@/stores/uiStore';

/**
 * "Showing the tree from Karim · Back to Abdul": shown while a view starts from someone
 * other than the tree's start (TV-04).
 */
export function FocusBanner({
  focusId,
  start,
  className,
}: {
  focusId: ID | null;
  start: ID | null;
  className?: string;
}) {
  const t = useTranslations('treeView');
  const locale = useLocale() as Locale;
  const nameDisplay = useTree((s) => s.tree?.settings.nameDisplay ?? 'auto');
  const focus = useTree((s) => (focusId ? s.persons.get(focusId) : undefined));
  const startPerson = useTree((s) => (start ? s.persons.get(start) : undefined));
  if (!focus || !startPerson || focusId === start) return null;
  const focusName = displayName(focus.names, nameDisplay, locale);
  const startName = displayName(startPerson.names, nameDisplay, locale);
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-full border bg-background/95 py-1 pr-1 pl-3 text-sm shadow-sm',
        className,
      )}
    >
      <span className="truncate">
        {t.rich('showingFrom', {
          name: focusName.text,
          person: (chunks) => <strong lang={focusName.lang}>{chunks}</strong>,
        })}
      </span>
      <Button
        size="sm"
        variant="outline"
        className="h-8 rounded-full"
        onClick={() => uiStore.getState().focus(null)}
      >
        {t('backTo', { name: startName.text })}
      </Button>
    </div>
  );
}
