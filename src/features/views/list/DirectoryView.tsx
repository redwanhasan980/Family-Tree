'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDownIcon, ArrowUpIcon, SearchIcon, SlidersHorizontalIcon, XIcon } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useIsDesktop } from '@/features/editor/shell/useIsDesktop';
import { usePersonText } from '@/features/editor/shell/usePersonText';
import { Avatar, useShownPhoto } from '@/features/media/Avatar';
import { formatPartialDate } from '@/lib/domain/dates';
import { displayName } from '@/lib/domain/names';
import type { ID, LifeEvent, Locale } from '@/lib/domain/types';
import { cn } from '@/lib/utils';
import { selectGraph, useTree } from '@/stores/treeStore';
import { uiStore, useUi } from '@/stores/uiStore';

import {
  activeFilters,
  branchHeads,
  directoryEntries,
  filterDirectory,
  NO_FILTERS,
  sortDirectory,
  type DirectoryEntry,
  type DirectoryFilters,
  type DirectorySort,
  type SortDirection,
} from './directory';
import { ListModeSwitch } from './ListModeSwitch';
import { VIRTUALIZE_ABOVE } from './OutlineView';
import { branchColor } from '../shared/colors';
import { startingPerson } from '../shared/focus';

const ROW_HEIGHT = 56;
const CARD_HEIGHT = 76;
const SELECT =
  'h-11 min-w-0 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

/** "12 Apr 1931", "about 1931", or "" when unknown. */
function useEventDate(): (event: LifeEvent | undefined) => string {
  const t = useTranslations('person');
  const locale = useLocale() as Locale;
  return (event) => {
    if (!event?.date) return '';
    const date = formatPartialDate(event.date, locale);
    return event.date.approximate ? t('approxDate', { date }) : date;
  };
}

/** What a row shows besides the name: generation and branch, in words. */
function usePlace(heads: readonly ID[]) {
  const t = useTranslations('listView');
  const format = useFormatter();
  const locale = useLocale() as Locale;
  const persons = useTree((s) => s.persons);
  const nameDisplay = useTree((s) => s.tree?.settings.nameDisplay ?? 'auto');
  return {
    generation: (entry: DirectoryEntry) =>
      entry.generation === null
        ? t('notInTree')
        : t('generation', { number: format.number(entry.generation) }),
    branch: (entry: DirectoryEntry) => {
      const head = entry.branch === null ? undefined : persons.get(heads[entry.branch]!);
      return head ? displayName(head.names, nameDisplay, locale) : null;
    },
  };
}

function SortHeader({
  column,
  sort,
  direction,
  onSort,
  children,
}: {
  column: DirectorySort;
  sort: DirectorySort;
  direction: SortDirection;
  onSort: (column: DirectorySort) => void;
  children: ReactNode;
}) {
  const active = sort === column;
  const Icon = direction === 'asc' ? ArrowUpIcon : ArrowDownIcon;
  return (
    <th
      scope="col"
      aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      className="px-3 py-2 text-left font-medium"
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className="-mx-2 inline-flex h-9 items-center gap-1 rounded-md px-2 outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {children}
        {active && <Icon aria-hidden className="size-4" />}
      </button>
    </th>
  );
}

function TableRow({
  entry,
  index,
  selected,
  place,
}: {
  entry: DirectoryEntry;
  index: number;
  selected: boolean;
  place: ReturnType<typeof usePlace>;
}) {
  const t = useTranslations('person');
  const { name } = usePersonText(entry.person);
  const photo = useShownPhoto(entry.person.photo);
  const eventDate = useEventDate();
  const branch = place.branch(entry);
  const died = eventDate(entry.person.death) || (entry.person.isLiving ? '' : t('deceased'));
  return (
    <tr
      aria-rowindex={index + 2}
      aria-selected={selected}
      data-person-id={entry.person.id}
      onClick={() => uiStore.getState().select(entry.person.id)}
      className={cn('h-14 cursor-pointer border-b', selected ? 'bg-primary/10' : 'hover:bg-accent')}
    >
      <td className="px-3">
        <button
          type="button"
          className="flex items-center gap-3 rounded-md text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          onClick={(event) => {
            event.stopPropagation();
            uiStore.getState().select(entry.person.id);
          }}
        >
          <Avatar name={name} photo={photo} size="sm" className="bg-muted text-foreground" />
          <span>
            <span lang={name.lang} className="font-medium">
              {name.text}
            </span>
            {entry.person.nickname && (
              <span className="text-muted-foreground"> ({entry.person.nickname})</span>
            )}
          </span>
        </button>
      </td>
      <td className="px-3 tabular-nums">{eventDate(entry.person.birth)}</td>
      <td className="px-3 tabular-nums">{died}</td>
      <td className={cn('px-3', entry.generation === null && 'text-muted-foreground')}>
        {place.generation(entry)}
      </td>
      <td className="px-3">
        {branch && (
          <span className="flex items-center gap-2">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: branchColor(entry.branch) }}
            />
            <span lang={branch.lang}>{branch.text}</span>
          </span>
        )}
      </td>
    </tr>
  );
}

function Card({
  entry,
  selected,
  place,
  style,
}: {
  entry: DirectoryEntry;
  selected: boolean;
  place: ReturnType<typeof usePlace>;
  style?: React.CSSProperties;
}) {
  const t = useTranslations('listView');
  const { name, years } = usePersonText(entry.person);
  const photo = useShownPhoto(entry.person.photo);
  const showDates = useTree((s) => s.tree?.settings.showDates ?? true);
  const branch = place.branch(entry);
  return (
    <li style={style} data-person-id={entry.person.id}>
      <button
        type="button"
        aria-pressed={selected}
        onClick={() => uiStore.getState().select(entry.person.id)}
        className={cn(
          'flex h-[76px] w-full items-center gap-3 border-b px-4 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset',
          selected ? 'bg-primary/10' : 'hover:bg-accent',
        )}
      >
        <Avatar name={name} photo={photo} size="sm" className="bg-muted text-foreground" />
        <span className="min-w-0 flex-1">
          <span className="block truncate">
            <span lang={name.lang} className="font-medium">
              {name.text}
            </span>
            {entry.person.nickname && (
              <span className="text-muted-foreground"> ({entry.person.nickname})</span>
            )}
          </span>
          <span className="block truncate text-sm text-muted-foreground tabular-nums">
            {[showDates && years, place.generation(entry)].filter(Boolean).join(' · ')}
          </span>
          {branch && (
            <span className="flex items-center gap-1.5 truncate text-sm text-muted-foreground">
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: branchColor(entry.branch) }}
              />
              <span lang={branch.lang} className="truncate">
                {t('branchOf', { name: branch.text })}
              </span>
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

function Filters({
  filters,
  onChange,
  sort,
  onSort,
  maxGeneration,
  heads,
}: {
  filters: DirectoryFilters;
  onChange: (filters: DirectoryFilters) => void;
  sort: DirectorySort;
  onSort: (sort: DirectorySort) => void;
  maxGeneration: number;
  heads: readonly ID[];
}) {
  const t = useTranslations();
  const format = useFormatter();
  const locale = useLocale() as Locale;
  const persons = useTree((s) => s.persons);
  const nameDisplay = useTree((s) => s.tree?.settings.nameDisplay ?? 'auto');
  return (
    <>
      <select
        className={SELECT}
        aria-label={t('listView.sortBy')}
        value={sort}
        onChange={(event) => onSort(event.target.value as DirectorySort)}
      >
        <option value="name">
          {t('listView.sortBy')}: {t('listView.sortName')}
        </option>
        <option value="birth">
          {t('listView.sortBy')}: {t('listView.sortBirth')}
        </option>
        <option value="generation">
          {t('listView.sortBy')}: {t('listView.sortGeneration')}
        </option>
      </select>
      <select
        className={SELECT}
        aria-label={t('listView.status')}
        value={filters.status}
        onChange={(event) =>
          onChange({ ...filters, status: event.target.value as DirectoryFilters['status'] })
        }
      >
        <option value="all">{t('listView.statusAll')}</option>
        <option value="living">{t('person.living')}</option>
        <option value="deceased">{t('person.deceased')}</option>
      </select>
      <select
        className={SELECT}
        aria-label={t('listView.gender')}
        value={filters.gender}
        onChange={(event) =>
          onChange({ ...filters, gender: event.target.value as DirectoryFilters['gender'] })
        }
      >
        <option value="all">{t('listView.genderAll')}</option>
        <option value="male">{t('listView.genderMale')}</option>
        <option value="female">{t('listView.genderFemale')}</option>
      </select>
      <select
        className={SELECT}
        aria-label={t('listView.sortGeneration')}
        value={filters.generation ?? ''}
        onChange={(event) =>
          onChange({
            ...filters,
            generation: event.target.value ? Number(event.target.value) : null,
          })
        }
      >
        <option value="">{t('listView.generationAll')}</option>
        {Array.from({ length: maxGeneration }, (_, i) => (
          <option key={i + 1} value={i + 1}>
            {t('listView.generation', { number: format.number(i + 1) })}
          </option>
        ))}
      </select>
      {heads.length > 1 && (
        <select
          className={SELECT}
          aria-label={t('listView.branch')}
          value={filters.branch ?? ''}
          onChange={(event) =>
            onChange({ ...filters, branch: event.target.value ? Number(event.target.value) : null })
          }
        >
          <option value="">{t('listView.branchAll')}</option>
          {heads.map((id, index) => {
            const head = persons.get(id);
            return (
              <option key={id} value={index}>
                {t('listView.branchOf', {
                  name: head ? displayName(head.names, nameDisplay, locale).text : '',
                })}
              </option>
            );
          })}
        </select>
      )}
    </>
  );
}

/**
 * The List view's "Everyone" mode (LV-04, DESIGN §13.5): every person in the tree, with
 * a name search, sorting and filters. A table on desktop, cards on phones; long lists
 * render only what is on screen (LV-05).
 */
export function DirectoryView() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const graph = useTree(selectGraph);
  const rootId = useTree((s) => s.tree?.rootPersonId);
  const nameDisplay = useTree((s) => s.tree?.settings.nameDisplay ?? 'auto');
  const selectedId = useUi((s) => s.selectedId);
  const revealRequest = useUi((s) => s.revealRequest);
  const desktop = useIsDesktop();
  const [filters, setFilters] = useState<DirectoryFilters>(NO_FILTERS);
  const [sort, setSort] = useState<DirectorySort>('name');
  const [direction, setDirection] = useState<SortDirection>('asc');
  const [showFilters, setShowFilters] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrolledToSelection = useRef(false);
  const pendingScroll = useRef<ID | null>(null);

  const start = useMemo(() => startingPerson(graph, rootId), [graph, rootId]);
  const entries = useMemo(
    () => directoryEntries(graph, start, nameDisplay, locale),
    [graph, start, nameDisplay, locale],
  );
  const heads = useMemo(() => branchHeads(graph, start), [graph, start]);
  const maxGeneration = useMemo(
    () => entries.reduce((max, e) => Math.max(max, e.generation ?? 0), 0),
    [entries],
  );
  const shown = useMemo(
    () => sortDirectory(filterDirectory(entries, filters), sort, direction, locale),
    [entries, filters, sort, direction, locale],
  );
  const place = usePlace(heads);
  const filterCount = activeFilters(filters);
  const filtered = filterCount > 0 || filters.query.trim() !== '';

  const virtual = shown.length > VIRTUALIZE_ABOVE;
  const size = desktop ? ROW_HEIGHT : CARD_HEIGHT;
  // The app doesn't use the React Compiler, which is what this rule protects.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: shown.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => size,
    getItemKey: (index) => shown[index]?.person.id ?? index,
    overscan: 12,
    // The table header sits above the rows inside the scroll area.
    scrollMargin: desktop ? 44 : 0,
    enabled: virtual,
  });

  const scrollToPerson = (personId: ID) => {
    const index = shown.findIndex((entry) => entry.person.id === personId);
    if (index < 0) return;
    if (virtual) virtualizer.scrollToIndex(index, { align: 'center' });
    else
      scrollRef.current
        ?.querySelector(`[data-person-id="${CSS.escape(personId)}"]`)
        ?.scrollIntoView({ block: 'center' });
  };

  // Coming from another view: show the selected person (P6-08).
  useEffect(() => {
    if (scrolledToSelection.current) return;
    scrolledToSelection.current = true;
    const id = uiStore.getState().selectedId;
    if (id) scrollToPerson(id);
  });

  // "Find someone" (VIS-04): the search already selected them; bring them into view,
  // clearing filters that hide them.
  const reveal = useEffectEvent((personId: ID) => {
    if (shown.some((entry) => entry.person.id === personId)) scrollToPerson(personId);
    else if (filtered) {
      setFilters(NO_FILTERS);
      pendingScroll.current = personId;
    }
  });
  useEffect(() => {
    if (!revealRequest) return;
    uiStore.getState().revealDone();
    reveal(revealRequest.personId);
  }, [revealRequest]);

  // After the filters are cleared for a reveal, scroll once the person is listed.
  useEffect(() => {
    const id = pendingScroll.current;
    if (id && shown.some((entry) => entry.person.id === id)) {
      pendingScroll.current = null;
      scrollToPerson(id);
    }
  });

  const onSortColumn = (column: DirectorySort) => {
    if (column === sort) setDirection(direction === 'asc' ? 'desc' : 'asc');
    else {
      setSort(column);
      setDirection('asc');
    }
  };

  const items = virtual
    ? virtualizer.getVirtualItems().map((item) => ({ entry: shown[item.index]!, item }))
    : shown.map((entry, index) => ({ entry, item: { index, start: index * size } }));
  const before = virtual ? (items[0]?.item.start ?? 0) - virtualizer.options.scrollMargin : 0;
  const after = virtual
    ? virtualizer.getTotalSize() -
      ((items.at(-1)?.item.start ?? 0) - virtualizer.options.scrollMargin + size)
    : 0;

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b bg-background px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <ListModeSwitch />
          <label className="relative min-w-40 flex-1">
            <span className="sr-only">{t('listView.find')}</span>
            <SearchIcon
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              value={filters.query}
              placeholder={t('listView.find')}
              onChange={(event) => setFilters({ ...filters, query: event.target.value })}
              className="h-11 pl-9"
            />
          </label>
          {desktop ? (
            <Filters
              filters={filters}
              onChange={setFilters}
              sort={sort}
              onSort={setSort}
              maxGeneration={maxGeneration}
              heads={heads}
            />
          ) : (
            <Button
              variant="outline"
              className="h-11"
              aria-expanded={showFilters}
              onClick={() => setShowFilters(!showFilters)}
            >
              <SlidersHorizontalIcon aria-hidden /> {t('listView.filters', { count: filterCount })}
            </Button>
          )}
        </div>
        {!desktop && showFilters && (
          <div className="grid grid-cols-2 gap-2">
            <Filters
              filters={filters}
              onChange={setFilters}
              sort={sort}
              onSort={setSort}
              maxGeneration={maxGeneration}
              heads={heads}
            />
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <p aria-live="polite" className="text-sm text-muted-foreground">
            {t('listView.count', { count: shown.length })}
          </p>
          {filtered && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9"
              onClick={() => setFilters(NO_FILTERS)}
            >
              <XIcon aria-hidden /> {t('listView.clearFilters')}
            </Button>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto pb-24">
        {shown.length === 0 ? (
          <p className="px-4 py-10 text-center text-muted-foreground">{t('listView.none')}</p>
        ) : desktop ? (
          <table
            aria-label={t('listView.directoryLabel')}
            aria-rowcount={shown.length + 1}
            className="mx-auto w-full max-w-5xl text-sm"
          >
            <thead className="sticky top-0 z-10 h-11 border-b bg-background">
              <tr aria-rowindex={1}>
                <SortHeader column="name" sort={sort} direction={direction} onSort={onSortColumn}>
                  {t('listView.columnName')}
                </SortHeader>
                <SortHeader column="birth" sort={sort} direction={direction} onSort={onSortColumn}>
                  {t('person.born')}
                </SortHeader>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  {t('person.died')}
                </th>
                <SortHeader
                  column="generation"
                  sort={sort}
                  direction={direction}
                  onSort={onSortColumn}
                >
                  {t('listView.sortGeneration')}
                </SortHeader>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  {t('listView.columnBranch')}
                </th>
              </tr>
            </thead>
            <tbody>
              {before > 0 && <tr aria-hidden style={{ height: before }} />}
              {items.map(({ entry, item }) => (
                <TableRow
                  key={entry.person.id}
                  entry={entry}
                  index={item.index}
                  selected={entry.person.id === selectedId}
                  place={place}
                />
              ))}
              {after > 0 && <tr aria-hidden style={{ height: after }} />}
            </tbody>
          </table>
        ) : (
          <ul
            aria-label={t('listView.directoryLabel')}
            className="relative"
            style={virtual ? { height: virtualizer.getTotalSize() } : undefined}
          >
            {items.map(({ entry, item }) => (
              <Card
                key={entry.person.id}
                entry={entry}
                selected={entry.person.id === selectedId}
                place={place}
                style={
                  virtual
                    ? {
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${item.start}px)`,
                      }
                    : undefined
                }
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
