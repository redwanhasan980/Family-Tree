'use client';

import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronRightIcon,
  GripVerticalIcon,
  HeartCrackIcon,
  HeartIcon,
  Link2Icon,
  PlusIcon,
  StarIcon,
} from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { memo, type CSSProperties, type DragEvent, type KeyboardEvent } from 'react';

import { Button } from '@/components/ui/button';
import { usePersonText } from '@/features/editor/shell/usePersonText';
import { Avatar, useShownPhoto } from '@/features/media/Avatar';
import { startAdd } from '@/features/person/AddRelativeFlows';
import type { ShownName } from '@/lib/domain/names';
import type { Gender, ID, Locale, Person } from '@/lib/domain/types';
import { cn } from '@/lib/utils';
import { uiStore } from '@/stores/uiStore';

import { localNumber, type OutlineRow } from './outline';

/** Indent levels before a generation badge takes over (DESIGN §13.5). */
const PHONE_LEVELS = 6;
const DESKTOP_LEVELS = 16;

export interface Relative {
  name: ShownName;
  gender: Gender;
}

export interface OutlineItemProps {
  row: OutlineRow;
  /** The row's index, for the virtualizer's measurements (LV-05). */
  index: number;
  /** Position and measuring, when the list is virtualized. */
  style?: CSSProperties;
  measureRef?: (element: HTMLDivElement | null) => void;
  person: Person;
  /** Names and genders of the people the row mentions: partners and the other parent. */
  relativeOf: (id: ID) => Relative | null;
  accent: string | null;
  selected: boolean;
  /** The partner selected instead of the row's person, if any. */
  selectedId: ID | null;
  tabbable: boolean;
  isSelf: boolean;
  compact: boolean;
  showDates: boolean;
  /** The primary row's number, for a repeated person. */
  firstNumber: string | null;
  canMoveUp: boolean;
  canMoveDown: boolean;
  draggable: boolean;
  dropEdge: 'before' | 'after' | null;
  onActivate: (row: OutlineRow) => void;
  onToggle: (key: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>, row: OutlineRow) => void;
  onFocusRow: (key: string) => void;
  onMove: (row: OutlineRow, by: -1 | 1) => void;
  onDragStart: (row: OutlineRow, event: DragEvent<HTMLElement>) => void;
  onDragOver: (row: OutlineRow, event: DragEvent<HTMLDivElement>) => void;
  onDrop: (row: OutlineRow, event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
}

/**
 * One person in the List view's outline (LV-01/02): number, avatar, names, years,
 * profession, partners and, when a parent had children with more than one partner, the
 * other parent. The selected row offers adding a relative and moving among siblings.
 */
export const OutlineItem = memo(function OutlineItem({
  row,
  index,
  style,
  measureRef,
  person,
  relativeOf,
  accent,
  selected,
  selectedId,
  tabbable,
  isSelf,
  compact,
  showDates,
  firstNumber,
  canMoveUp,
  canMoveDown,
  draggable,
  dropEdge,
  onActivate,
  onToggle,
  onKeyDown,
  onFocusRow,
  onMove,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: OutlineItemProps) {
  const t = useTranslations();
  const format = useFormatter();
  const locale = useLocale() as Locale;
  const { name, years } = usePersonText(person);
  const photo = useShownPhoto(person.photo);
  const shownYears = showDates ? years : '';
  const number = localNumber(row.number, locale);
  const levels = compact ? PHONE_LEVELS : DESKTOP_LEVELS;
  const step = compact ? 14 : 24;
  const indent = Math.min(row.depth, levels) * step;
  const deep = row.depth > levels;
  const canMove = canMoveUp || canMoveDown;
  const via = row.parentHasFamilies && row.viaPartnerId ? relativeOf(row.viaPartnerId) : null;
  const facts = [
    shownYears,
    person.profession,
    row.expandable && !row.expanded
      ? t('treeView.moreHidden', { count: row.hiddenCount })
      : undefined,
  ].filter(Boolean);

  return (
    <div
      ref={measureRef}
      data-index={index}
      style={style}
      role="treeitem"
      aria-level={row.depth + 1}
      aria-setsize={row.setSize}
      aria-posinset={row.position}
      aria-expanded={row.expandable ? row.expanded : undefined}
      aria-selected={selected}
      tabIndex={tabbable ? 0 : -1}
      data-person-id={person.id}
      data-row-key={row.key}
      onClick={() => onActivate(row)}
      onKeyDown={(event) => onKeyDown(event, row)}
      onFocus={(event) => {
        if (event.target === event.currentTarget) onFocusRow(row.key);
      }}
      onDragOver={(event) => onDragOver(row, event)}
      onDrop={(event) => onDrop(row, event)}
      className={cn(
        'group relative cursor-pointer border-b outline-none select-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset',
        selected ? 'bg-primary/10' : 'hover:bg-accent',
        dropEdge === 'before' && 'shadow-[inset_0_2px_0_var(--primary)]',
        dropEdge === 'after' && 'shadow-[inset_0_-2px_0_var(--primary)]',
      )}
    >
      {indent > 0 && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-3"
          style={{
            width: indent,
            backgroundImage: `repeating-linear-gradient(to right, var(--border) 0 1px, transparent 1px ${step}px)`,
          }}
        />
      )}
      {draggable && (
        <span
          draggable
          aria-hidden
          title={t('listView.reorder', { name: name.text })}
          onDragStart={(event) => onDragStart(row, event)}
          onDragEnd={onDragEnd}
          onClick={(event) => event.stopPropagation()}
          className="absolute top-1/2 left-0 flex h-10 w-3 -translate-y-1/2 cursor-grab items-center justify-center text-muted-foreground opacity-0 group-hover:opacity-100 active:cursor-grabbing"
        >
          <GripVerticalIcon className="size-4 shrink-0" />
        </span>
      )}
      <div
        className="flex min-h-14 items-center gap-2 py-1.5 pr-3"
        style={{ paddingLeft: 12 + indent }}
      >
        {row.expandable ? (
          // Arrow keys do this for keyboard and screen reader users (LV-06).
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            aria-label={t(row.expanded ? 'treeView.hideDescendants' : 'treeView.showDescendants', {
              name: name.text,
            })}
            onClick={(event) => {
              event.stopPropagation();
              onToggle(row.key);
            }}
            className="-my-1 flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-background"
          >
            <ChevronRightIcon
              aria-hidden
              className={cn(
                'size-5 transition-transform motion-reduce:transition-none',
                row.expanded && 'rotate-90',
              )}
            />
          </button>
        ) : (
          <span aria-hidden className="w-10 shrink-0" />
        )}
        <span
          className="relative shrink-0 rounded-full p-0.5"
          style={accent ? { backgroundColor: accent } : undefined}
        >
          <Avatar name={name} photo={photo} size="sm" className="bg-muted text-foreground">
            {isSelf && (
              <StarIcon
                aria-hidden
                className="absolute -top-1.5 -left-1.5 size-4 fill-highlight text-highlight drop-shadow-sm"
              />
            )}
          </Avatar>
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span lang={name.lang} className="font-medium">
              {name.text}
            </span>
            {person.nickname && (
              <span className="text-sm text-muted-foreground">({person.nickname})</span>
            )}
            {!person.isLiving && <span className="sr-only">, {t('treeView.deceased')}</span>}
            {isSelf && <span className="sr-only">, {t('treeView.you')}</span>}
            {deep && (
              <span className="rounded-full bg-muted px-2 text-xs text-muted-foreground">
                {t('listView.generation', { number: format.number(row.depth + 1) })}
              </span>
            )}
          </p>
          <div className="text-sm text-muted-foreground">
            {row.isRef ? (
              <p className="flex items-center gap-1">
                <Link2Icon aria-hidden className="size-3.5 shrink-0" />
                {t('listView.seeFirst', { number: firstNumber ?? '' })}
              </p>
            ) : (
              <p className="tabular-nums">
                <span aria-hidden>{number}</span>
                <span className="sr-only">{t('listView.number', { number })}</span>
                {facts.map((fact, i) => (
                  <span key={i}> · {fact}</span>
                ))}
              </p>
            )}
            {(row.partners.length > 0 || via) && !row.isRef && (
              <p className="mt-0.5 flex flex-wrap gap-x-2 gap-y-1">
                {row.partners.map((partner) => {
                  const relative = relativeOf(partner.personId);
                  if (!relative) return null;
                  const ended = partner.status === 'divorced' || partner.status === 'separated';
                  const Icon = ended ? HeartCrackIcon : HeartIcon;
                  const role = t('relatives.roles.spouse', { gender: relative.gender });
                  return (
                    <button
                      key={partner.personId}
                      type="button"
                      tabIndex={-1}
                      onClick={(event) => {
                        event.stopPropagation();
                        uiStore.getState().select(partner.personId);
                      }}
                      aria-label={
                        partner.status && partner.status !== 'married'
                          ? t('listView.relationStatus', {
                              role,
                              status: t(`person.statuses.${partner.status}`),
                              name: relative.name.text,
                            })
                          : t('listView.relation', { role, name: relative.name.text })
                      }
                      className={cn(
                        'inline-flex max-w-full items-center gap-1 rounded-full px-1.5 hover:bg-background hover:text-foreground',
                        selectedId === partner.personId && 'bg-primary/15 text-foreground',
                      )}
                    >
                      <Icon aria-hidden className="size-3.5 shrink-0 text-highlight" />
                      <span lang={relative.name.lang} className="truncate">
                        {relative.name.text}
                      </span>
                    </button>
                  );
                })}
                {via && (
                  <span>
                    {t('listView.relation', {
                      role: t('relatives.roles.parent', { gender: via.gender }),
                      name: via.name.text,
                    })}
                  </span>
                )}
              </p>
            )}
          </div>
        </div>
      </div>
      {selected && !row.isRef && (
        <div
          className="flex flex-wrap gap-2 pr-3 pb-2"
          style={{ paddingLeft: 12 + indent + 48 }}
          onClick={(event) => event.stopPropagation()}
        >
          <Button
            className="h-11"
            aria-label={t('relatives.menuTitle', { name: name.text })}
            onClick={(event) =>
              startAdd(person.id, 'menu', event.currentTarget.getBoundingClientRect())
            }
          >
            <PlusIcon aria-hidden /> {t('listView.addRelative')}
          </Button>
          {canMove && (
            <>
              <Button
                variant="outline"
                className="h-11"
                disabled={!canMoveUp}
                aria-label={t('person.moveUp', { name: name.text })}
                data-move="up"
                onClick={() => onMove(row, -1)}
              >
                <ArrowUpIcon aria-hidden /> {t('listView.up')}
              </Button>
              <Button
                variant="outline"
                className="h-11"
                disabled={!canMoveDown}
                aria-label={t('person.moveDown', { name: name.text })}
                data-move="down"
                onClick={() => onMove(row, 1)}
              >
                <ArrowDownIcon aria-hidden /> {t('listView.down')}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
});
