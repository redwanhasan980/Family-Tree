'use client';

import { ChevronUpIcon, PlusIcon, XIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { initials } from '@/lib/domain/names';
import type { Person } from '@/lib/domain/types';
import { cn } from '@/lib/utils';
import { useTree } from '@/stores/treeStore';
import { uiStore, useUi } from '@/stores/uiStore';

import { usePersonText } from './usePersonText';

import type { ReactNode } from 'react';

function Bar({ person, actions }: { person: Person; actions?: ReactNode }) {
  const t = useTranslations('editor');
  const tr = useTranslations('relatives');
  const { name, years } = usePersonText(person);
  return (
    <div className="flex items-center gap-2 border-t bg-card px-2 py-1.5">
      <button
        type="button"
        className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-xl px-2 text-left outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
        onClick={() => uiStore.getState().setDetailsOpen(true)}
        aria-label={`${t('openDetails')}: ${name.text}`}
      >
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
        >
          {initials(name.text, name.lang)}
        </span>
        <span className="min-w-0 flex-1">
          <span lang={name.lang} className="block truncate font-semibold">
            {name.text}
          </span>
          {years && <span className="block text-xs text-muted-foreground">{years}</span>}
        </span>
        <ChevronUpIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      </button>
      {actions}
      <Button
        size="icon"
        className="size-11 shrink-0 rounded-full"
        aria-label={tr('menuTitle', { name: name.text })}
        onClick={() => uiStore.getState().startAdd({ personId: person.id, kind: 'menu' })}
      >
        <PlusIcon className="size-5" aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-11 shrink-0"
        aria-label={t('clearSelection')}
        onClick={() => uiStore.getState().select(null)}
      >
        <XIcon aria-hidden />
      </Button>
    </div>
  );
}

/**
 * Phones: the selected person, above the bottom bar (DESIGN §13.3: tap selects, the
 * sheet peeks). Tapping it opens the details sheet.
 */
export function SelectionBar({ className, actions }: { className?: string; actions?: ReactNode }) {
  const selectedId = useUi((s) => s.selectedId);
  const person = useTree((s) => (selectedId ? s.persons.get(selectedId) : undefined));
  if (!person) return null;
  return (
    <div className={cn(className)}>
      <Bar person={person} actions={actions} />
    </div>
  );
}
