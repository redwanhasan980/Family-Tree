'use client';

import { FlagIcon, FocusIcon, HistoryIcon, PanelRightOpenIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { setRoot } from '@/features/editor/commands';
import { useEditor } from '@/features/editor/EditorProvider';
import { displayName } from '@/lib/domain/names';
import { spouseRelation } from '@/lib/domain/relatives';
import type { ID, Locale } from '@/lib/domain/types';
import { useTree } from '@/stores/treeStore';
import { uiStore, type AddKind } from '@/stores/uiStore';

const ADD_KINDS: Exclude<AddKind, 'menu'>[] = ['child', 'spouse', 'parent', 'sibling', 'link'];

/**
 * Right-click (desktop) or long-press (phones) on a person card (DESIGN §13.3): details,
 * add a relative, show the tree from here, or start the tree from them. Elsewhere on the
 * canvas the browser's own menu stays.
 */
export function PersonMenu({ children }: { children: ReactNode }) {
  const t = useTranslations('relatives');
  const tv = useTranslations('treeView');
  const locale = useLocale() as Locale;
  const editor = useEditor();
  const [personId, setPersonId] = useState<ID | null>(null);
  const person = useTree((s) => (personId ? s.persons.get(personId) : undefined));
  const nameDisplay = useTree((s) => s.tree?.settings.nameDisplay ?? 'auto');
  const rootId = useTree((s) => s.tree?.rootPersonId);

  return (
    <ContextMenu onOpenChange={(open) => !open && setPersonId(null)}>
      <ContextMenuTrigger
        asChild
        onContextMenuCapture={(event) => {
          const card = (event.target as Element).closest('[data-person-id]');
          const id = card?.getAttribute('data-person-id');
          if (id) setPersonId(id);
          // Not on a card: keep the browser's menu.
          else event.stopPropagation();
        }}
      >
        {children}
      </ContextMenuTrigger>
      {person && (
        <ContextMenuContent className="w-64">
          <ContextMenuLabel lang={displayName(person.names, nameDisplay, locale).lang}>
            {displayName(person.names, nameDisplay, locale).text}
          </ContextMenuLabel>
          <ContextMenuItem
            onSelect={() => {
              uiStore.getState().select(person.id);
              uiStore.getState().setDetailsOpen(true);
            }}
          >
            <PanelRightOpenIcon aria-hidden /> {t('openDetails')}
          </ContextMenuItem>
          <ContextMenuSeparator />
          {ADD_KINDS.map((kind) => (
            <ContextMenuItem
              key={kind}
              onSelect={() => {
                uiStore.getState().select(person.id);
                uiStore.getState().startAdd({ personId: person.id, kind });
              }}
            >
              {kind === 'spouse'
                ? t('spouse', { relation: spouseRelation(person.gender) })
                : t(kind)}
            </ContextMenuItem>
          ))}
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => uiStore.getState().focus(person.id)}>
            <FocusIcon aria-hidden /> {t('showFromHere')}
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => uiStore.getState().showAncestors(person.id)}>
            <HistoryIcon aria-hidden /> {tv('showAncestors')}
          </ContextMenuItem>
          {rootId !== person.id && (
            <ContextMenuItem
              onSelect={() => {
                editor.run((ctx) => setRoot(ctx, person.id));
                uiStore.getState().focus(null);
              }}
            >
              <FlagIcon aria-hidden /> {t('makeRoot')}
            </ContextMenuItem>
          )}
        </ContextMenuContent>
      )}
    </ContextMenu>
  );
}
