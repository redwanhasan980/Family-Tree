'use client';

import { XIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { acceptsShortcuts } from '@/features/editor/shortcuts';
import { PersonPanel } from '@/features/person/PersonPanel';
import { useTree } from '@/stores/treeStore';
import { uiStore, useUi } from '@/stores/uiStore';

import { useIsDesktop } from './useIsDesktop';

/**
 * Where a selected person's details open (P3-03): a side panel from 1024 px, a bottom
 * drawer below. Escape or the close button clears the selection.
 */
export function DetailsContainer() {
  const t = useTranslations();
  const selectedId = useUi((s) => s.selectedId);
  const person = useTree((s) => (selectedId ? s.persons.get(selectedId) : undefined));
  const detailsOpen = useUi((s) => s.detailsOpen);
  const desktop = useIsDesktop();
  const close = () => uiStore.getState().select(null);

  useEffect(() => {
    if (!desktop || !person) return;
    const onKey = (event: KeyboardEvent) => {
      // Escape in a dialog or menu closes that, not the panel.
      if (event.key !== 'Escape' || event.defaultPrevented || !acceptsShortcuts(event.target)) {
        return;
      }
      uiStore.getState().select(null);
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
          <p className="text-sm font-medium text-muted-foreground">{t('editor.details')}</p>
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
        <PersonPanel person={person} />
      </aside>
    );
  }

  // Phones: a tap selects and shows the selection bar; the sheet opens from there.
  return (
    <Drawer
      open={Boolean(person) && detailsOpen}
      onOpenChange={(open) => uiStore.getState().setDetailsOpen(open)}
    >
      {/* The panel itself describes the person, so there's no separate description. */}
      <DrawerContent aria-describedby={undefined} className="max-h-[92dvh]">
        <DrawerHeader className="sr-only">
          <DrawerTitle>{t('editor.details')}</DrawerTitle>
        </DrawerHeader>
        <div className="overflow-y-auto p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {person && <PersonPanel person={person} />}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
