'use client';

import { HeartCrackIcon, HeartIcon } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';

import { usePersonText } from '@/features/editor/shell/usePersonText';
import { Avatar, useShownPhoto } from '@/features/media/Avatar';
import { flattenOutline, localNumber, type OutlineRow } from '@/features/views/list/outline';
import { useDescendantView } from '@/features/views/shared/useDescendantView';
import { APP_NAME } from '@/lib/brand';
import { buildDescendantTree } from '@/lib/domain/graph';
import { displayName } from '@/lib/domain/names';
import type { Locale, Person } from '@/lib/domain/types';
import { useTree } from '@/stores/treeStore';

import { pageSize } from '../geometry';
import { paginate } from '../paginate';
import { SHEET_WIDTH } from './FamilySheet';
import { useSceneFonts, useWhenPainted, type SceneProps } from './scene';
import { useExportDate } from './SceneFrame';

const PAD = 48;
const INDENT = 20;
/** Deeper rows stop moving right and say their generation instead. */
const MAX_INDENT_DEPTH = 8;
const FOOTER_H = 32;
const NAME_PX = 15;

/** The List view's rows as they are now, or with every branch open (EXP-04). */
export function useListRows(expandAll: boolean): OutlineRow[] {
  const { graph, focusId, descTree } = useDescendantView('list');
  return useMemo(() => {
    const root = expandAll && focusId ? buildDescendantTree(graph, focusId) : descTree;
    return root ? flattenOutline(root) : [];
  }, [expandAll, focusId, graph, descTree]);
}

/** One person on paper: number, name, years, profession and husbands or wives. */
export function ListSheetRow({ row, photos }: { row: OutlineRow; photos: boolean }) {
  const t = useTranslations();
  const format = useFormatter();
  const locale = useLocale() as Locale;
  const persons = useTree((s) => s.persons);
  const nameDisplay = useTree((s) => s.tree?.settings.nameDisplay ?? 'auto');
  const showDates = useTree((s) => s.tree?.settings.showDates ?? true);
  const person = persons.get(row.personId) as Person;
  const { name, years } = usePersonText(person);
  const photo = useShownPhoto(person.photo);
  const deep = row.depth > MAX_INDENT_DEPTH;
  const facts = [showDates && years, person.profession].filter(Boolean);
  return (
    <div
      className="flex break-inside-avoid items-start gap-2 border-b py-1.5"
      style={{ paddingLeft: Math.min(row.depth, MAX_INDENT_DEPTH) * INDENT }}
    >
      {photos && (
        <Avatar name={name} photo={photo} size="xs" className="mt-0.5 bg-muted text-foreground" />
      )}
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm text-muted-foreground tabular-nums">
            {localNumber(row.number, locale)}
          </span>
          <span lang={name.lang} className="font-medium">
            {name.text}
          </span>
          {person.nickname && (
            <span className="text-sm text-muted-foreground">({person.nickname})</span>
          )}
          {deep && (
            <span className="text-xs text-muted-foreground">
              {t('listView.generation', { number: format.number(row.depth + 1) })}
            </span>
          )}
          {facts.length > 0 && (
            <span className="text-sm text-muted-foreground tabular-nums">{facts.join(' · ')}</span>
          )}
        </p>
        {row.partners.length > 0 && !row.isRef && (
          <p className="flex flex-wrap gap-x-3 text-sm text-muted-foreground">
            {row.partners.map((partner) => {
              const relative = persons.get(partner.personId);
              if (!relative) return null;
              const ended = partner.status === 'divorced' || partner.status === 'separated';
              const Icon = ended ? HeartCrackIcon : HeartIcon;
              const shown = displayName(relative.names, nameDisplay, locale);
              return (
                <span key={partner.personId} className="inline-flex items-center gap-1">
                  <Icon aria-hidden className="size-3.5 text-highlight" />
                  <span lang={shown.lang}>{shown.text}</span>
                </span>
              );
            })}
          </p>
        )}
      </div>
    </div>
  );
}

function SheetHeader({ title, subtitle }: { title: string; subtitle: string }) {
  if (!title && !subtitle) return null;
  return (
    <header className="pb-4">
      {title && <h1 className="text-3xl font-semibold">{title}</h1>}
      {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
    </header>
  );
}

/**
 * The List view on paper (P7-04): one long sheet for a picture, and pages for a PDF,
 * with the title on the first page and page numbers on all of them. Rows are measured
 * once in the long sheet, then dealt onto pages.
 */
export function ListPages({ options, title, subtitle, onReady }: SceneProps) {
  const t = useTranslations('export');
  const rows = useListRows(options.expandAll);
  const [whole, setWhole] = useState<HTMLDivElement | null>(null);
  const family = useSceneFonts(whole);
  const date = useExportDate(options.date);
  const credit = t('madeWith', { app: APP_NAME });
  const headerRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<number[][] | null>(null);

  const paper = pageSize(
    options.paper === 'fit' ? 'a4' : options.paper,
    options.orientation === 'auto' ? 'portrait' : options.orientation,
    { w: 1, h: 2 },
  );
  const width = SHEET_WIDTH;
  const height = Math.round((width * paper.h) / paper.w);
  const pdf = options.format === 'pdf';

  // Deal the measured rows onto pages (PDF only).
  useLayoutEffect(() => {
    if (!pdf || !family || !rowsRef.current) return;
    const heights = Array.from(rowsRef.current.children).map(
      (child) => (child as HTMLElement).offsetHeight,
    );
    const room = height - 2 * PAD - FOOTER_H;
    const header = headerRef.current?.offsetHeight ?? 0;
    setPages(paginate(heights, room, room - header));
  }, [pdf, family, rows, height]);

  useWhenPainted(
    Boolean(family && whole && (!pdf || pages)),
    () => {
      if (!whole) return null;
      const frames =
        pdf && pagesRef.current ? (Array.from(pagesRef.current.children) as HTMLElement[]) : null;
      return { kind: 'html', whole, pages: frames, namePx: NAME_PX };
    },
    onReady,
  );

  const footer = (page?: number, total?: number) => (
    <footer
      className="flex items-end justify-between gap-4 text-xs text-muted-foreground"
      style={{ height: FOOTER_H }}
    >
      <span>{date}</span>
      <span>
        {page !== undefined && total !== undefined && total > 1
          ? `${t('page', { current: page, total })} · ${credit}`
          : credit}
      </span>
    </footer>
  );

  return (
    <div className="font-sans text-foreground">
      <div ref={setWhole} style={{ width, padding: PAD }} className="bg-surface">
        <div ref={headerRef}>
          <SheetHeader title={title} subtitle={subtitle} />
        </div>
        <div ref={rowsRef}>
          {rows.map((row) => (
            <ListSheetRow key={row.key} row={row} photos={options.photos} />
          ))}
        </div>
        {footer()}
      </div>
      {pdf && pages && (
        <div ref={pagesRef}>
          {pages.map((indices, i) => (
            <div
              key={i}
              style={{ width, height, padding: PAD }}
              className="flex flex-col bg-surface"
            >
              {i === 0 && <SheetHeader title={title} subtitle={subtitle} />}
              <div className="flex-1">
                {indices.map((index) => (
                  <ListSheetRow key={rows[index]!.key} row={rows[index]!} photos={options.photos} />
                ))}
              </div>
              {footer(i + 1, pages.length)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
