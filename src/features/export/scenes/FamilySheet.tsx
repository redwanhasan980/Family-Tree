'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState, type ReactNode } from 'react';

import { usePersonText } from '@/features/editor/shell/usePersonText';
import { Avatar, useShownPhoto } from '@/features/media/Avatar';
import { useFamilyPerson } from '@/features/views/family/useFamilyPerson';
import { APP_NAME } from '@/lib/brand';
import { buildFamilyCard } from '@/lib/domain/graph';
import { displayName } from '@/lib/domain/names';
import type { ID, Locale, Person } from '@/lib/domain/types';
import { cn } from '@/lib/utils';
import { selectGraph, useTree } from '@/stores/treeStore';

import { useSceneFonts, useWhenPainted, type SceneProps } from './scene';
import { useExportDate } from './SceneFrame';

/** A sheet is an A4 page wide, in CSS px (DESIGN §14). */
export const SHEET_WIDTH = 794;
const NAME_PX = 16;

function SheetPerson({
  person,
  photos,
  large = false,
  children,
}: {
  person: Person;
  photos: boolean;
  large?: boolean;
  children?: ReactNode;
}) {
  const showDates = useTree((s) => s.tree?.settings.showDates ?? true);
  const { name, years } = usePersonText(person);
  const photo = useShownPhoto(person.photo);
  return (
    <div className={cn('flex items-center gap-3 rounded-2xl border bg-card p-3', large && 'p-4')}>
      <Avatar
        name={name}
        photo={photos ? photo : null}
        size={large ? 'lg' : 'sm'}
        className="bg-muted text-foreground"
      />
      <div className="min-w-0 flex-1">
        <p lang={name.lang} className={cn('font-semibold break-words', large && 'text-lg')}>
          {name.text}
        </p>
        {person.nickname && <p className="text-sm text-muted-foreground">({person.nickname})</p>}
        {showDates && years && (
          <p className="text-sm text-muted-foreground tabular-nums">{years}</p>
        )}
        {person.profession && <p className="text-sm text-muted-foreground">{person.profession}</p>}
        {children}
      </div>
    </div>
  );
}

/**
 * The family sheet (FC-09): the Family card's family on one page, without buttons or
 * empty places, and with every marriage's children, each under its own heading.
 */
export function FamilySheet({ options, title, subtitle, onReady }: SceneProps) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const graph = useTree(selectGraph);
  const nameDisplay = useTree((s) => s.tree?.settings.nameDisplay ?? 'auto');
  const { personId, start } = useFamilyPerson();
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const family = useSceneFonts(element);
  const date = useExportDate(options.date);
  const model = useMemo(
    () => (personId ? buildFamilyCard(graph, personId, start) : null),
    [graph, personId, start],
  );

  useWhenPainted(
    Boolean(family && model && element),
    () => (element ? { kind: 'html', whole: element, pages: null, namePx: NAME_PX } : null),
    onReady,
  );

  if (!model) return null;
  const person = (id: ID) => graph.persons.get(id);
  const focus = person(model.focusId)!;
  const focusName = displayName(focus.names, nameDisplay, locale);
  const parents = [
    model.fatherId,
    model.motherId,
    ...model.otherParents.map((p) => p.personId),
  ].flatMap((id) => (id ? (person(id) ?? []) : []));
  const several = model.partners.length > 1;
  // One marriage: its children under "Children". Several: each marriage under its own name.
  const groups = several ? model.partners : model.partners.filter((p) => p.childIds.length > 0);

  return (
    <div
      ref={setElement}
      style={{ width: SHEET_WIDTH }}
      className="space-y-6 bg-surface p-12 font-sans text-foreground"
    >
      {(title || subtitle) && (
        <header>
          {title && <h1 className="text-3xl font-semibold">{title}</h1>}
          {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
        </header>
      )}

      <h2 lang={focusName.lang} className="text-xl font-semibold">
        {t('familyView.showing', { name: focusName.text })}
      </h2>

      {parents.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">{t('familyView.parents')}</h2>
          <div className="grid grid-cols-2 gap-3">
            {parents.map((parent) => (
              <SheetPerson key={parent.id} person={parent} photos={options.photos} />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <div className="grid grid-cols-2 gap-3">
          <SheetPerson person={focus} photos={options.photos} large />
          {model.partners.length === 1 && model.partners[0]!.personId && (
            <SheetPerson
              person={person(model.partners[0]!.personId)!}
              photos={options.photos}
              large
            />
          )}
        </div>
      </section>

      {groups.map((group, i) => {
        const partner = group.personId ? person(group.personId) : undefined;
        const heading = several
          ? partner
            ? t('familyView.partnerOrdinal', {
                number: i + 1,
                gender: partner.gender,
                name: displayName(partner.names, nameDisplay, locale).text,
              })
            : t('familyView.unknownParent')
          : t('familyView.children');
        return (
          <section key={group.personId ?? 'unknown'} className="space-y-2">
            <h2 className="text-sm font-medium text-muted-foreground">{heading}</h2>
            {several && partner && (
              <div className="grid grid-cols-2 gap-3">
                <SheetPerson person={partner} photos={options.photos} />
              </div>
            )}
            {group.childIds.length > 0 && (
              <div className="grid grid-cols-3 gap-3">
                {group.childIds.flatMap((id) => {
                  const child = person(id);
                  return child
                    ? [
                        <SheetPerson key={id} person={child} photos={options.photos}>
                          <p className="text-xs text-muted-foreground">
                            {t('familyView.childCount', { count: model.childCounts.get(id) ?? 0 })}
                          </p>
                        </SheetPerson>,
                      ]
                    : [];
                })}
              </div>
            )}
          </section>
        );
      })}

      <footer className="flex justify-between gap-4 pt-2 text-xs text-muted-foreground">
        <span>{date}</span>
        <span>{t('export.madeWith', { app: APP_NAME })}</span>
      </footer>
    </div>
  );
}
