'use client';

import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';
import { uiStore, useUi, type ListMode } from '@/stores/uiStore';

const MODES: readonly ListMode[] = ['outline', 'directory'];

/** "Family lines | Everyone": the List view's two ways of listing people (LV-04). */
export function ListModeSwitch() {
  const t = useTranslations('listView');
  const current = useUi((s) => s.listMode);
  return (
    <div
      role="group"
      aria-label={t('modeLabel')}
      className="inline-flex shrink-0 rounded-full border bg-muted p-0.5"
    >
      {MODES.map((mode) => (
        <button
          key={mode}
          type="button"
          aria-pressed={current === mode}
          onClick={() => uiStore.getState().setListMode(mode)}
          className={cn(
            'h-9 rounded-full px-3 text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
            current === mode
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {t(mode === 'outline' ? 'modeOutline' : 'modeDirectory')}
        </button>
      ))}
    </div>
  );
}
