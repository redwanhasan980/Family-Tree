'use client';

import { EllipsisIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { ViewKind } from '@/lib/domain/types';
import { enabledViews } from '@/lib/features';
import { cn } from '@/lib/utils';
import { useUi, uiStore } from '@/stores/uiStore';

import { PRIMARY_VIEWS, VIEW_ICONS } from './views';

/**
 * Desktop view tabs (VIS-01). Staged views appear only when their flag is on (ADR-014).
 * Switching keeps the selection and focus (uiStore).
 */
export function ViewTabs({ className }: { className?: string }) {
  const t = useTranslations('views');
  const current = useUi((s) => s.view);
  return (
    <nav aria-label={t('label')} className={cn('flex items-center gap-1', className)}>
      {enabledViews().map((view) => {
        const Icon = VIEW_ICONS[view];
        const active = view === current;
        return (
          <button
            key={view}
            type="button"
            aria-current={active ? 'true' : undefined}
            onClick={() => uiStore.getState().setView(view)}
            className={cn(
              'inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <Icon className="size-4" aria-hidden />
            {t(`short.${view}`)}
          </button>
        );
      })}
    </nav>
  );
}

function NavButton({
  view,
  label,
  active,
  onClick,
  icon: Icon,
}: {
  view?: ViewKind;
  label: string;
  active: boolean;
  onClick: () => void;
  icon: typeof EllipsisIcon;
}) {
  return (
    <button
      type="button"
      data-view={view}
      aria-current={active ? 'true' : undefined}
      onClick={onClick}
      className={cn(
        'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-xs font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <span
        className={cn(
          'flex h-7 w-12 items-center justify-center rounded-full transition-colors',
          active && 'bg-primary/15',
        )}
      >
        <Icon className="size-5" aria-hidden />
      </span>
      {label}
    </button>
  );
}

/** Mobile bottom bar: Tree, Family, Circle, List and More (VIS-01). */
export function BottomNav({ onMore, className }: { onMore: () => void; className?: string }) {
  const t = useTranslations();
  const current = useUi((s) => s.view);
  const inMore = !PRIMARY_VIEWS.includes(current);
  return (
    <nav
      aria-label={t('views.label')}
      className={cn(
        'flex items-stretch gap-1 border-t bg-background/95 px-2 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] backdrop-blur',
        className,
      )}
    >
      {PRIMARY_VIEWS.map((view) => (
        <NavButton
          key={view}
          view={view}
          label={t(`views.short.${view}`)}
          icon={VIEW_ICONS[view]}
          active={view === current}
          onClick={() => uiStore.getState().setView(view)}
        />
      ))}
      <NavButton label={t('editor.more')} icon={EllipsisIcon} active={inMore} onClick={onMore} />
    </nav>
  );
}
