'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { usePersonText } from '@/features/editor/shell/usePersonText';
import { compareNames, displayName, initials } from '@/lib/domain/names';
import { searchPersons } from '@/lib/domain/search';
import type { ID, Locale, Person } from '@/lib/domain/types';
import { useTree } from '@/stores/treeStore';

const SHOWN = 30;

function Row({ person }: { person: Person }) {
  const { name, years } = usePersonText(person);
  return (
    <>
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold"
      >
        {initials(name.text, name.lang)}
      </span>
      <span lang={name.lang} className="min-w-0 flex-1 truncate">
        {name.text}
      </span>
      {years && <span className="text-xs text-muted-foreground tabular-nums">{years}</span>}
    </>
  );
}

/**
 * Finds someone already in the tree by name or nickname, in either script (REL-06,
 * I18N-04). Without a query it lists people alphabetically.
 */
export function PersonPicker({
  exclude,
  onPick,
}: {
  exclude: ReadonlySet<ID>;
  onPick: (personId: ID) => void;
}) {
  const t = useTranslations('relatives');
  const locale = useLocale() as Locale;
  const persons = useTree((s) => s.persons);
  const nameDisplay = useTree((s) => s.tree?.settings.nameDisplay ?? 'auto');
  const [query, setQuery] = useState('');

  const people = useMemo(() => {
    const candidates = [...persons.values()].filter((p) => !exclude.has(p.id));
    if (query.trim()) {
      return searchPersons(candidates, query, SHOWN).map((hit) => persons.get(hit.personId)!);
    }
    return candidates
      .map((person) => ({ person, text: displayName(person.names, nameDisplay, locale).text }))
      .sort((a, b) => compareNames(a.text, b.text, locale))
      .slice(0, SHOWN)
      .map((n) => n.person);
  }, [persons, exclude, query, nameDisplay, locale]);

  return (
    <Command shouldFilter={false} className="rounded-xl border">
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder={t('search')}
        aria-label={t('search')}
        className="h-11 text-base"
      />
      <CommandList className="max-h-72">
        <CommandEmpty>{t('noMatches')}</CommandEmpty>
        {people.map((person) => (
          <CommandItem
            key={person.id}
            value={person.id}
            onSelect={() => onPick(person.id)}
            className="min-h-11 gap-3"
          >
            <Row person={person} />
          </CommandItem>
        ))}
      </CommandList>
    </Command>
  );
}
