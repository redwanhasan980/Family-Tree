'use client';

import { useTranslations } from 'next-intl';
import { useRef } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FORM_DIALOG } from '@/features/person/AddRelativeDialog';
import { PersonPicker } from '@/features/person/PersonPicker';
import type { ID } from '@/lib/domain/types';
import { uiStore, useUi } from '@/stores/uiStore';

const NOBODY: ReadonlySet<ID> = new Set();

/**
 * "Find someone" (UX-03, VIS-04): Ctrl/⌘+K, "/" or the header button. Picking a person
 * selects them and the current view expands the way to them and centres them.
 */
export function SearchDialog() {
  const t = useTranslations();
  const open = useUi((s) => s.searchOpen);
  const picked = useRef(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) picked.current = false;
        uiStore.getState().setSearchOpen(next);
      }}
    >
      <DialogContent
        className={FORM_DIALOG}
        // After a pick, keyboard focus goes to the person's card instead of back here.
        onCloseAutoFocus={(event) => {
          if (picked.current) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('editor.search')}</DialogTitle>
          <DialogDescription className="sr-only">{t('relatives.search')}</DialogDescription>
        </DialogHeader>
        <PersonPicker
          exclude={NOBODY}
          onPick={(personId) => {
            picked.current = true;
            uiStore.getState().setSearchOpen(false);
            uiStore.getState().reveal(personId);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
