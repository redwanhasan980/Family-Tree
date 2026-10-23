'use client';

import { XIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { initials } from '@/lib/domain/names';
import type { Person } from '@/lib/domain/types';
import { useTree } from '@/stores/treeStore';
import { uiStore, useUi } from '@/stores/uiStore';

import { useIsDesktop } from './useIsDesktop';
import { usePersonText } from './usePersonText';

/** The selected person's name and years. P4 replaces the body with the person panel. */
function PersonSummary({ person }: { person: Person }) {
  const t = useTranslations('editor');
  const { name, years } = usePersonText(person);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xl font-semibold text-primary"
        >
          {initials(name.text, name.lang)}
        </span>
        <div className="min-w-0">
          <p lang={name.lang} className="text-lg font-semibold">
            {name.text}
          </p>
          {name.secondary && (
            <p lang={name.secondary.lang} className="text-sm text-muted-foreground">
              {name.secondary.text}
            </p>
          )}
          {years && <p className="text-sm text-muted-foreground tabular-nums">{years}</p>}
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{t('detailsSoon')}</p>
    </div>
  );
}

/**
 * Where a selected person's details open (P3-03): a side panel from 1024 px, a bottom
 * drawer below. Escape or the close button clears the selection.
 */
export function DetailsContainer() {
  const t = useTranslations();
  const selectedId = useUi((s) => s.selectedId);
  const person = useTree((s) => (selectedId ? s.persons.get(selectedId) : undefined));
  const desktop = useIsDesktop();
  const close = () => uiStore.getState().select(null);

  useEffect(() => {
    if (!desktop || !person) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') uiStore.getState().select(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [desktop, person]);

  if (desktop) {
    if (!person) return null;
    return (
      <aside
        aria-label={t('editor.details')}
        className="w-96 shrink-0 overflow-y-auto border-l bg-card p-5"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">{t('editor.details')}</h2>
          <Button
            variant="ghost"
            size="icon"
            className="size-9"
            onClick={close}
            aria-label={t('common.close')}
          >
            <XIcon aria-hidden />
          </Button>
        </div>
        <PersonSummary person={person} />
      </aside>
    );
  }

  return (
    <Drawer open={Boolean(person)} onOpenChange={(open) => !open && close()}>
      <DrawerContent>
        <DrawerHeader className="sr-only">
          <DrawerTitle>{t('editor.details')}</DrawerTitle>
          <DrawerDescription>{t('editor.detailsSoon')}</DrawerDescription>
        </DrawerHeader>
        <div className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {person && <PersonSummary person={person} />}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
