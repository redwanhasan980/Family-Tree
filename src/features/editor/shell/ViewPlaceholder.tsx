'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { Avatar, useShownPhoto } from '@/features/media/Avatar';
import { compareNames, displayName } from '@/lib/domain/names';
import type { Locale, Person, ViewKind } from '@/lib/domain/types';
import { cn } from '@/lib/utils';
import { useTree } from '@/stores/treeStore';
import { uiStore, useUi } from '@/stores/uiStore';

import { usePersonText } from './usePersonText';
import { VIEW_ICONS } from './views';

function PersonRow({ person, selected }: { person: Person; selected: boolean }) {
  const { name, years } = usePersonText(person);
  const photo = useShownPhoto(person.photo);
  return (
    <li>
      <button
        type="button"
        aria-pressed={selected}
        onClick={() => uiStore.getState().select(person.id)}
        className={cn(
          'flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset',
          selected && 'bg-primary/10',
        )}
      >
        <Avatar name={name} photo={photo} size="sm" className="bg-muted text-foreground" />
        <span lang={name.lang} className="min-w-0 flex-1 truncate font-medium">
          {name.text}
        </span>
        {years && <span className="text-sm text-muted-foreground tabular-nums">{years}</span>}
      </button>
    </li>
  );
}

/**
 * Stands in for a view until it is built (Tree in P4, the others in P6). It lists everyone,
 * so the family stays visible and the details panel can be reached.
 */
export function ViewPlaceholder({ view }: { view: ViewKind }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const persons = useTree((s) => s.persons);
  const nameDisplay = useTree((s) => s.tree?.settings.nameDisplay ?? 'auto');
  const selectedId = useUi((s) => s.selectedId);
  const Icon = VIEW_ICONS[view];

  const people = useMemo(() => {
    const named = [...persons.values()].map((person) => ({
      person,
      text: displayName(person.names, nameDisplay, locale).text,
    }));
    return named.sort((a, b) => compareNames(a.text, b.text, locale)).map((n) => n.person);
  }, [persons, nameDisplay, locale]);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-6 sm:px-6">
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed bg-card p-6 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-highlight/20">
          <Icon className="size-6" aria-hidden />
        </span>
        <h1 className="text-xl font-semibold">
          {t('editor.soonTitle', { view: t(`views.name.${view}`) })}
        </h1>
        <p className="max-w-md text-sm text-muted-foreground">{t('editor.soonBody')}</p>
      </div>
      <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
        {people.map((person) => (
          <PersonRow key={person.id} person={person} selected={person.id === selectedId} />
        ))}
      </ul>
    </div>
  );
}
