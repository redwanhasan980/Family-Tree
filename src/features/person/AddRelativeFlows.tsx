'use client';

import {
  BabyIcon,
  HeartHandshakeIcon,
  Link2Icon,
  UserRoundIcon,
  UsersRoundIcon,
  type LucideIcon,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { useIsDesktop } from '@/features/editor/shell/useIsDesktop';
import { displayName } from '@/lib/domain/names';
import { spouseRelation } from '@/lib/domain/relatives';
import type { ID, Locale } from '@/lib/domain/types';
import { useTree } from '@/stores/treeStore';
import { uiStore, useUi, type AddFlow, type AddKind } from '@/stores/uiStore';

import { AddRelativeDialog } from './AddRelativeDialog';
import { BulkAddChildren } from './BulkAddChildren';

const ACTIONS: { kind: Exclude<AddKind, 'menu'>; icon: LucideIcon }[] = [
  { kind: 'child', icon: BabyIcon },
  { kind: 'spouse', icon: HeartHandshakeIcon },
  { kind: 'parent', icon: UserRoundIcon },
  { kind: 'sibling', icon: UsersRoundIcon },
  { kind: 'link', icon: Link2Icon },
];

/** Starts adding a relative; the menu opens next to `anchor` on desktop. */
export function startAdd(personId: ID, kind: AddKind, anchor?: DOMRect | AddFlow['anchor']) {
  uiStore.getState().select(personId);
  uiStore.getState().startAdd({
    personId,
    kind,
    ...(anchor && {
      anchor: { x: anchor.x, y: anchor.y, width: anchor.width, height: anchor.height },
    }),
  });
}

/** The relative buttons, labelled for this person (REL-12). */
export function RelativeActions({
  personId,
  layout = 'grid',
}: {
  personId: ID;
  layout?: 'grid' | 'list';
}) {
  const t = useTranslations('relatives');
  const gender = useTree((s) => s.persons.get(personId)?.gender ?? 'unknown');
  return (
    <div className={layout === 'grid' ? 'grid grid-cols-2 gap-2' : 'flex flex-col gap-1'}>
      {ACTIONS.map(({ kind, icon: Icon }) => (
        <button
          key={kind}
          type="button"
          data-add={kind}
          onClick={() => uiStore.getState().startAdd({ personId, kind })}
          className={
            layout === 'grid'
              ? 'flex min-h-12 items-center gap-2 rounded-xl border bg-background px-3 text-left text-sm font-medium transition-colors outline-none last:col-span-2 hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50'
              : 'flex min-h-12 items-center gap-3 rounded-xl px-3 text-left font-medium transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50'
          }
        >
          <Icon className="size-5 shrink-0 text-primary" aria-hidden />
          {kind === 'spouse' ? t('spouse', { relation: spouseRelation(gender) }) : t(kind)}
        </button>
      ))}
    </div>
  );
}

/** The quick-add menu (REL-02): a popover by the card on desktop, a sheet on phones. */
function QuickAddMenu({ flow }: { flow: AddFlow }) {
  const t = useTranslations('relatives');
  const locale = useLocale() as Locale;
  const desktop = useIsDesktop();
  const person = useTree((s) => s.persons.get(flow.personId));
  const nameDisplay = useTree((s) => s.tree?.settings.nameDisplay ?? 'auto');
  const anchor = flow.anchor;
  const virtualRef = useMemo(
    () => ({
      current: {
        getBoundingClientRect: () =>
          DOMRect.fromRect(anchor ?? { x: window.innerWidth / 2, y: 80, width: 0, height: 0 }),
      },
    }),
    [anchor],
  );
  if (!person) return null;
  const title = t('menuTitle', { name: displayName(person.names, nameDisplay, locale).text });
  const close = (open: boolean) => {
    if (!open) uiStore.getState().endAdd();
  };

  if (desktop) {
    return (
      <Popover open onOpenChange={close}>
        <PopoverAnchor virtualRef={virtualRef} />
        <PopoverContent side="right" align="start" className="w-72 space-y-2 p-2">
          <p className="px-2 pt-1 text-sm font-semibold">{title}</p>
          <RelativeActions personId={flow.personId} layout="list" />
        </PopoverContent>
      </Popover>
    );
  }
  return (
    <Drawer open onOpenChange={close}>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle>{t('addRelative')}</DrawerTitle>
          <DrawerDescription>{title}</DrawerDescription>
        </DrawerHeader>
        <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <RelativeActions personId={flow.personId} />
        </div>
      </DrawerContent>
    </Drawer>
  );
}

/** Shows the menu or form for the current "add a relative" flow, if any. */
export function AddRelativeFlows() {
  const flow = useUi((s) => s.addFlow);
  if (!flow) return null;
  const close = () => uiStore.getState().endAdd();
  if (flow.kind === 'menu') return <QuickAddMenu flow={flow} />;
  if (flow.kind === 'child') {
    return (
      <BulkAddChildren personId={flow.personId} welcome={flow.welcome === true} onClose={close} />
    );
  }
  return (
    <AddRelativeDialog
      // A new key per kind, so switching from sibling to parent starts a fresh form.
      key={`${flow.personId}:${flow.kind}`}
      personId={flow.personId}
      kind={flow.kind}
      onClose={close}
      onSwitch={(kind) => uiStore.getState().startAdd({ personId: flow.personId, kind })}
    />
  );
}
