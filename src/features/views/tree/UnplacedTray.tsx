'use client';

import { Link2Icon, UserRoundSearchIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useIsDesktop } from '@/features/editor/shell/useIsDesktop';
import { usePersonText } from '@/features/editor/shell/usePersonText';
import { startAdd } from '@/features/person/AddRelativeFlows';
import { initials } from '@/lib/domain/names';
import type { ID, Person } from '@/lib/domain/types';
import { cn } from '@/lib/utils';
import { useTree } from '@/stores/treeStore';
import { uiStore } from '@/stores/uiStore';

function Row({ person, onDone }: { person: Person; onDone: () => void }) {
  const t = useTranslations('unplaced');
  const { name, years } = usePersonText(person);
  return (
    <li className="flex min-h-12 items-center gap-2 py-1">
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold"
      >
        {initials(name.text, name.lang)}
      </span>
      <span className="min-w-0 flex-1">
        <span lang={name.lang} className="block truncate font-medium">
          {name.text}
        </span>
        {years && <span className="block text-xs text-muted-foreground">{years}</span>}
      </span>
      <Button
        variant="ghost"
        className="h-11 px-3"
        onClick={() => {
          onDone();
          uiStore.getState().focus(person.id);
          uiStore.getState().select(person.id);
        }}
      >
        {t('show')}
      </Button>
      <Button
        variant="outline"
        className="h-11 px-3"
        onClick={() => {
          onDone();
          startAdd(person.id, 'link');
        }}
      >
        <Link2Icon aria-hidden /> {t('connect')}
      </Button>
    </li>
  );
}

function List({ ids, onDone }: { ids: readonly ID[]; onDone: () => void }) {
  const persons = useTree((s) => s.persons);
  return (
    <ul className="max-h-[50dvh] divide-y overflow-y-auto">
      {ids.map((id) => {
        const person = persons.get(id);
        return person ? <Row key={id} person={person} onDone={onDone} /> : null;
      })}
    </ul>
  );
}

/**
 * People the tree can't reach from where it starts (REL-11), each with a way to connect
 * them to a relative or to look at the tree from them.
 */
export function UnplacedTray({ ids, className }: { ids: readonly ID[]; className?: string }) {
  const t = useTranslations('unplaced');
  const desktop = useIsDesktop();
  const [open, setOpen] = useState(false);
  if (ids.length === 0) return null;
  const close = () => setOpen(false);
  const trigger = (
    <Button
      variant="outline"
      className={cn('h-11 rounded-full bg-background/95 shadow-sm backdrop-blur', className)}
      onClick={desktop ? undefined : () => setOpen(true)}
    >
      <UserRoundSearchIcon aria-hidden /> {t('button', { count: ids.length })}
    </Button>
  );

  if (desktop) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent align="end" side="top" className="w-96 space-y-2">
          <p className="font-semibold">{t('title')}</p>
          <p className="text-sm text-muted-foreground">{t('body')}</p>
          <List ids={ids} onDone={close} />
        </PopoverContent>
      </Popover>
    );
  }
  return (
    <>
      {trigger}
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>{t('title')}</DrawerTitle>
            <DrawerDescription>{t('body')}</DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <List ids={ids} onDone={close} />
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
