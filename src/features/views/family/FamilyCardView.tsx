'use client';

import { ArrowLeftIcon, ChevronRightIcon, HeartIcon, InfoIcon, PlusIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { useIsDesktop } from '@/features/editor/shell/useIsDesktop';
import { usePersonText } from '@/features/editor/shell/usePersonText';
import { Avatar, useShownPhoto } from '@/features/media/Avatar';
import { startAdd } from '@/features/person/AddRelativeFlows';
import { UnplacedTray } from '@/features/views/tree/UnplacedTray';
import { buildFamilyCard, unplacedPersons, type FamilyCardModel } from '@/lib/domain/graph';
import { displayName } from '@/lib/domain/names';
import { spouseRelation } from '@/lib/domain/relatives';
import type { ID, Locale, Person } from '@/lib/domain/types';
import { cn } from '@/lib/utils';
import { selectGraph, useTree } from '@/stores/treeStore';
import { uiStore, useUi } from '@/stores/uiStore';

import { goToFamily } from './goToFamily';
import { startingPerson } from '../shared/focus';

/** A swipe moves to a brother or sister (FC-02): far enough, fast enough, sideways. */
const SWIPE_PX = 60;
const SWIPE_SPEED = 0.3;

type Direction = 'down' | 'up' | 'next' | 'previous' | 'none';

const ENTER: Record<Direction, string> = {
  down: 'slide-in-from-bottom-6',
  up: 'slide-in-from-top-6',
  next: 'slide-in-from-right-8',
  previous: 'slide-in-from-left-8',
  none: '',
};

/** How the family changed: down to a child, up to a parent, along the siblings. */
function directionOf(previous: FamilyCardModel | null, next: ID | null): Direction {
  if (!previous || !next) return 'none';
  if (previous.partners.some((p) => p.childIds.includes(next))) return 'down';
  if (
    previous.fatherId === next ||
    previous.motherId === next ||
    previous.otherParents.some((p) => p.personId === next)
  ) {
    return 'up';
  }
  const from = previous.siblingIds.indexOf(previous.focusId);
  const to = previous.siblingIds.indexOf(next);
  if (to < 0) return 'none';
  return to > from ? 'next' : 'previous';
}

function openDetails(personId: ID): void {
  uiStore.getState().select(personId);
  uiStore.getState().setDetailsOpen(true);
}

/** Photo, names, years and profession (FC-05). */
function PersonFace({
  person,
  size,
  children,
}: {
  person: Person;
  size: 'sm' | 'md' | 'lg';
  children?: ReactNode;
}) {
  const { name, years } = usePersonText(person);
  const photo = useShownPhoto(person.photo);
  const showDates = useTree((s) => s.tree?.settings.showDates ?? true);
  return (
    <>
      <Avatar name={name} photo={photo} size={size} className="bg-muted text-foreground" />
      <span className="min-w-0 flex-1">
        <span lang={name.lang} className="block font-semibold break-words">
          {name.text}
        </span>
        {person.nickname && (
          <span className="block text-sm text-muted-foreground">({person.nickname})</span>
        )}
        {showDates && years && (
          <span className="block text-sm text-muted-foreground tabular-nums">{years}</span>
        )}
        {person.profession && (
          <span className="block truncate text-sm text-muted-foreground">{person.profession}</span>
        )}
        {children}
      </span>
    </>
  );
}

/**
 * A tile that opens a family, with a corner button for the person's details (FC-05): the
 * tile moves, the button only shows. Siblings, not nested buttons.
 */
function WithDetails({ person, children }: { person: Person; children: ReactNode }) {
  const t = useTranslations('familyView');
  const { name } = usePersonText(person);
  return (
    <div className="relative h-full">
      {children}
      <button
        type="button"
        aria-label={t('detailsOf', { name: name.text })}
        className="absolute top-1.5 right-1.5 flex size-10 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
        onClick={() => openDetails(person.id)}
      >
        <InfoIcon aria-hidden className="size-5" />
      </button>
    </div>
  );
}

const TILE =
  'flex w-full items-center gap-3 rounded-2xl border bg-card p-3 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50';

/** "+ Add father", "+ Add children" … (FC-04): opens the same flows as other views. */
function AddSlot({ label, onClick }: { label: string; onClick: (rect: DOMRect) => void }) {
  return (
    <button
      type="button"
      className="flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-3 text-sm font-medium text-muted-foreground outline-none hover:border-primary hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
      onClick={(event) => onClick(event.currentTarget.getBoundingClientRect())}
    >
      <PlusIcon className="size-4" aria-hidden /> {label}
    </button>
  );
}

function Breadcrumb({ trail }: { trail: readonly ID[] }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const desktop = useIsDesktop();
  const persons = useTree((s) => s.persons);
  const nameDisplay = useTree((s) => s.tree?.settings.nameDisplay ?? 'auto');
  if (trail.length < 2) return null;
  // Phones keep the last two steps: "… › father › focus".
  const shown = desktop || trail.length <= 3 ? trail : trail.slice(-2);
  return (
    <nav aria-label={t('circleView.breadcrumb')} className="min-w-0 flex-1 overflow-x-auto">
      <ol className="flex items-center gap-1 text-sm whitespace-nowrap">
        {shown.length < trail.length && (
          <li aria-hidden className="px-1 text-muted-foreground">
            …
          </li>
        )}
        {shown.map((id, i) => {
          const person = persons.get(id);
          if (!person) return null;
          const name = displayName(person.names, nameDisplay, locale);
          const last = i === shown.length - 1;
          return (
            <li key={id} className="flex items-center gap-1">
              {(i > 0 || shown.length < trail.length) && (
                <ChevronRightIcon aria-hidden className="size-4 text-muted-foreground" />
              )}
              {last ? (
                <span aria-current="location" lang={name.lang} className="px-1 font-semibold">
                  {name.text}
                </span>
              ) : (
                <button
                  type="button"
                  lang={name.lang}
                  className="h-9 rounded-full px-2 hover:bg-accent"
                  onClick={() => goToFamily(id)}
                >
                  {name.text}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * The Family card (FC-01..08, DESIGN §13.7): one family at a time, the simplest view for
 * phones and screen readers. Parents above, brothers and sisters beside, the couple in
 * the middle and their children below; every person opens their own family.
 */
export function FamilyCardView() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const graph = useTree(selectGraph);
  const rootId = useTree((s) => s.tree?.rootPersonId);
  const nameDisplay = useTree((s) => s.tree?.settings.nameDisplay ?? 'auto');
  const familySetting = useUi((s) => s.familyId);
  const focusSetting = useUi((s) => s.focusId);
  const selectedId = useUi((s) => s.selectedId);

  const start = useMemo(() => startingPerson(graph, rootId), [graph, rootId]);
  // Whose family: the one opened here, else the person the views start from.
  const focusId = [familySetting, focusSetting, start].find(
    (id): id is ID => id !== null && graph.persons.has(id),
  );
  const model = useMemo(
    () => (focusId ? buildFamilyCard(graph, focusId, start) : null),
    [graph, focusId, start],
  );
  const unplaced = useMemo(() => unplacedPersons(graph, start ?? undefined), [graph, start]);

  // Which marriage's children show (FC-03), per focus person.
  const [choice, setChoice] = useState<{ focusId: ID | null; index: number | 'all' }>({
    focusId: null,
    index: 0,
  });
  // The family shown before, to slide the new one in from the right side.
  const [previous, setPrevious] = useState<{ id: ID | null; model: FamilyCardModel | null }>({
    id: focusId ?? null,
    model,
  });
  const [direction, setDirection] = useState<Direction>('none');
  if (previous.id !== (focusId ?? null)) {
    setDirection(directionOf(previous.model, focusId ?? null));
    setPrevious({ id: focusId ?? null, model });
  }

  const scrollRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  // After moving to another family, start at the top (with the way back) and move
  // keyboard focus to its heading.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    scrollRef.current?.scrollTo({ top: 0 });
    headingRef.current?.focus({ preventScroll: true });
  }, [focusId]);

  const swipe = useRef<{ x: number; y: number; time: number } | null>(null);

  if (!model || !focusId) return null;
  const person = graph.persons.get(focusId)!;
  const nameOf = (id: ID) => displayName(graph.persons.get(id)!.names, nameDisplay, locale);
  const index = choice.focusId === focusId ? choice.index : 0;
  const partners = model.partners;
  const chosen =
    index === 'all' ? partners : partners[index] ? [partners[index]] : partners.slice(0, 1);
  const shownPartners = chosen.flatMap((p) => (p.personId ? [p.personId] : []));
  const childIds = chosen.flatMap((p) => p.childIds);
  const atSibling = model.siblingIds.indexOf(focusId);
  const backTo = model.trail.length > 1 ? model.trail.at(-2)! : focusId !== start ? start : null;
  const relation = spouseRelation(person.gender);
  const heading =
    shownPartners.length === 1
      ? t('familyView.couple', {
          first: nameOf(focusId).text,
          second: nameOf(shownPartners[0]!).text,
        })
      : nameOf(focusId).text;

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType !== 'touch') return;
    swipe.current = { x: event.clientX, y: event.clientY, time: event.timeStamp };
  };
  const onPointerUp = (event: PointerEvent) => {
    const from = swipe.current;
    swipe.current = null;
    if (!from || event.pointerType !== 'touch') return;
    const dx = event.clientX - from.x;
    const dy = event.clientY - from.y;
    const speed = Math.abs(dx) / Math.max(1, event.timeStamp - from.time);
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy) * 1.5 || speed < SWIPE_SPEED) return;
    // Swiping left shows the next brother or sister, as turning a page does.
    const target = model.siblingIds[atSibling + (dx < 0 ? 1 : -1)];
    if (target) goToFamily(target);
  };

  const parentTile = (id: ID | null, addLabel: string) => {
    const parent = id ? graph.persons.get(id) : undefined;
    if (!parent) {
      return <AddSlot label={addLabel} onClick={(rect) => startAdd(focusId, 'parent', rect)} />;
    }
    return (
      <WithDetails person={parent}>
        <button
          type="button"
          className={cn(
            TILE,
            'h-full flex-col items-start pr-12 sm:flex-row sm:items-center',
            parent.id === selectedId && 'ring-2 ring-primary',
          )}
          onClick={() => goToFamily(parent.id)}
        >
          <PersonFace person={parent} size="sm" />
          <ChevronRightIcon
            aria-hidden
            className="hidden size-5 shrink-0 -rotate-90 text-muted-foreground sm:block"
          />
        </button>
      </WithDetails>
    );
  };

  return (
    <div ref={scrollRef} className="relative h-full overflow-y-auto">
      <div className="@container mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 pt-3 pb-28 sm:px-6">
        {(backTo || model.trail.length > 1) && (
          <div className="flex items-center gap-2">
            {backTo && (
              <Button
                variant="outline"
                size="sm"
                className="h-9 shrink-0 rounded-full"
                onClick={() => goToFamily(backTo)}
              >
                <ArrowLeftIcon aria-hidden />
                {t('treeView.backTo', { name: nameOf(backTo).text })}
              </Button>
            )}
            <Breadcrumb trail={model.trail} />
          </div>
        )}

        <div
          key={focusId}
          className={cn(
            'flex animate-in touch-pan-y flex-col gap-5 duration-300 fade-in motion-reduce:animate-none',
            ENTER[direction],
          )}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
        >
          <section aria-labelledby="family-parents" className="space-y-2">
            <h3 id="family-parents" className="text-sm font-medium text-muted-foreground">
              {t('familyView.parents')}
            </h3>
            <ul className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch gap-2">
              <li>{parentTile(model.fatherId, t('familyView.addFather'))}</li>
              <li aria-hidden className="flex w-6 items-center justify-center">
                {model.parentsLink && <HeartIcon className="size-4 text-highlight" />}
              </li>
              <li>{parentTile(model.motherId, t('familyView.addMother'))}</li>
            </ul>
            {model.otherParents.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {model.otherParents.map(({ personId, kind }) => {
                  const other = graph.persons.get(personId);
                  if (!other) return null;
                  return (
                    <li key={personId}>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 rounded-full"
                        onClick={() => goToFamily(personId)}
                      >
                        <span lang={nameOf(personId).lang}>
                          {t('listView.relationStatus', {
                            role: t('relatives.roles.parent', { gender: other.gender }),
                            status: t(`person.kinds.${kind}`),
                            name: nameOf(personId).text,
                          })}
                        </span>
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {model.siblingIds.length > 1 && (
            <nav aria-label={t('familyView.siblings')}>
              <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 py-1">
                {model.siblingIds.map((id) => {
                  const sibling = graph.persons.get(id)!;
                  const name = nameOf(id);
                  const current = id === focusId;
                  return (
                    <li key={id} className="shrink-0">
                      <button
                        type="button"
                        aria-current={current ? 'page' : undefined}
                        onClick={() => goToFamily(id)}
                        className={cn(
                          'flex h-11 items-center gap-2 rounded-full border px-1.5 pr-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                          current
                            ? 'border-primary bg-primary/10 font-semibold'
                            : 'bg-card hover:bg-accent',
                        )}
                      >
                        <Avatar
                          name={name}
                          photo={sibling.photo}
                          size="xs"
                          className="bg-muted text-foreground"
                        />
                        <span lang={name.lang}>{name.text}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>
          )}

          <section aria-labelledby="family-couple" className="space-y-3">
            <h2
              id="family-couple"
              ref={headingRef}
              tabIndex={-1}
              lang={nameOf(focusId).lang}
              className="text-xl font-semibold outline-none"
            >
              {heading}
            </h2>
            <div className="grid gap-3 @lg:grid-cols-2">
              <button
                type="button"
                className={cn(TILE, 'p-4', focusId === selectedId && 'ring-2 ring-primary')}
                onClick={() => openDetails(focusId)}
              >
                <PersonFace person={person} size="lg" />
              </button>
              {shownPartners.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={cn(TILE, 'p-4', id === selectedId && 'ring-2 ring-primary')}
                  onClick={() => openDetails(id)}
                >
                  <PersonFace person={graph.persons.get(id)!} size="lg" />
                </button>
              ))}
              {partners.every((p) => p.personId === null) && (
                <AddSlot
                  label={t('relatives.spouseTitle', { relation })}
                  onClick={(rect) => startAdd(focusId, 'spouse', rect)}
                />
              )}
            </div>
            {partners.length > 1 && (
              <div
                role="group"
                aria-label={t('familyView.whoseChildren')}
                className="flex flex-wrap gap-2"
              >
                {partners.map((partner, i) => {
                  const other = partner.personId ? graph.persons.get(partner.personId) : undefined;
                  const label = other
                    ? t('familyView.partnerOrdinal', {
                        number: i + 1,
                        gender: other.gender,
                        name: nameOf(other.id).text,
                      })
                    : t('familyView.unknownParent');
                  return (
                    <Button
                      key={partner.personId ?? 'unknown'}
                      variant={index === i ? 'default' : 'outline'}
                      size="sm"
                      className="h-9 rounded-full"
                      aria-pressed={index === i}
                      onClick={() => setChoice({ focusId, index: i })}
                    >
                      {label}
                    </Button>
                  );
                })}
                <Button
                  variant={index === 'all' ? 'default' : 'outline'}
                  size="sm"
                  className="h-9 rounded-full"
                  aria-pressed={index === 'all'}
                  onClick={() => setChoice({ focusId, index: 'all' })}
                >
                  {t('familyView.allChildren')}
                </Button>
              </div>
            )}
          </section>

          <section aria-labelledby="family-children" className="space-y-2">
            <h3 id="family-children" className="text-sm font-medium text-muted-foreground">
              {t('familyView.children')}
            </h3>
            <ul className="grid grid-cols-2 gap-3 @xl:grid-cols-3">
              {childIds.map((id) => {
                const child = graph.persons.get(id);
                if (!child) return null;
                const via =
                  index === 'all' && partners.length > 1
                    ? partners.find((p) => p.childIds.includes(id))?.personId
                    : undefined;
                const viaPerson = via ? graph.persons.get(via) : undefined;
                return (
                  <li key={id}>
                    <WithDetails person={child}>
                      <button
                        type="button"
                        className={cn(
                          TILE,
                          'h-full flex-col items-start',
                          id === selectedId && 'ring-2 ring-primary',
                        )}
                        onClick={() => goToFamily(id)}
                      >
                        <span className="flex w-full items-start gap-3 pr-10">
                          <PersonFace person={child} size="sm" />
                        </span>
                        <span className="flex w-full items-center justify-between gap-1 text-sm text-muted-foreground">
                          <span>
                            {t('familyView.childCount', { count: model.childCounts.get(id) ?? 0 })}
                          </span>
                          <ChevronRightIcon aria-hidden className="size-4 shrink-0" />
                        </span>
                        {viaPerson && (
                          <span className="text-xs text-muted-foreground">
                            {t('listView.relation', {
                              role: t('relatives.roles.parent', { gender: viaPerson.gender }),
                              name: nameOf(viaPerson.id).text,
                            })}
                          </span>
                        )}
                      </button>
                    </WithDetails>
                  </li>
                );
              })}
              <li>
                <AddSlot
                  label={t('relatives.childrenTitle')}
                  onClick={(rect) => startAdd(focusId, 'child', rect)}
                />
              </li>
            </ul>
          </section>
        </div>
      </div>

      <p aria-live="polite" className="sr-only">
        {t('familyView.showing', { name: heading })}
      </p>
      <UnplacedTray ids={unplaced} className="fixed right-3 bottom-20 lg:absolute lg:bottom-3" />
    </div>
  );
}
