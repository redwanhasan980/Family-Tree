'use client';

import { useLocale } from 'next-intl';

import { formatYear } from '@/lib/domain/dates';
import { displayName, type ShownName } from '@/lib/domain/names';
import type { Locale, Person } from '@/lib/domain/types';
import { useTree } from '@/stores/treeStore';

/** A person's name (per the tree's name setting) and life years, as the UI shows them. */
export function usePersonText(person: Person): { name: ShownName; years: string } {
  const locale = useLocale() as Locale;
  const nameDisplay = useTree((s) => s.tree?.settings.nameDisplay ?? 'auto');
  const name = displayName(person.names, nameDisplay, locale);
  const born = person.birth?.date?.year;
  const died = person.death?.date?.year;
  const years =
    born === undefined && died === undefined
      ? ''
      : `${born === undefined ? '' : formatYear(born, locale)}–${died === undefined ? '' : formatYear(died, locale)}`;
  return { name, years };
}
