'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowUpIcon, ChevronsUpDownIcon, LoaderCircleIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from 'react';

import { Button } from '@/components/ui/button';
import { reorderChildren } from '@/features/editor/commands';
import { useIsDesktop } from '@/features/editor/shell/useIsDesktop';
import { useChange } from '@/features/editor/useChange';
import { useSelfPerson } from '@/features/person/useSelfPerson';
import { UnplacedTray } from '@/features/views/tree/UnplacedTray';
import { branchOf, parentsOf, unplacedPersons } from '@/lib/domain/graph';
import { displayName } from '@/lib/domain/names';
import type { ID, Locale } from '@/lib/domain/types';
import { useTree } from '@/stores/treeStore';
import { uiStore, useUi } from '@/stores/uiStore';

import { ListModeSwitch } from './ListModeSwitch';
import {
  droppedOrder,
  familyOf,
  flattenOutline,
  localNumber,
  movedOrder,
  outlineKeyOf,
  outlineStep,
  type OutlineRow,
} from './outline';
import { OutlineItem, type Relative } from './OutlineItem';
import { accentColor } from '../shared/colors';
import { FocusBanner } from '../shared/FocusBanner';
import { useDescendantView, useRevealRequest } from '../shared/useDescendantView';

/** Longer outlines render only the rows on screen (LV-05). */
export const VIRTUALIZE_ABOVE = 200;

/** Another child of the same parents: where a dragged row can be dropped. */
const sameFamily = (a: OutlineRow, b: OutlineRow) =>
  a.parentKey === b.parentKey && a.viaPartnerId === b.viaPartnerId && a.key !== b.key;

interface PendingFocus {
  key: string;
  /** A move button to keep focus on after reordering. */
  part?: 'up' | 'down';
}

/**
 * The List view's family lines (LV-01..06, DESIGN §13.5): the focus person's descendants
 * as an indented outline with d'Aboville numbers. It is the accessible alternative to the
 * drawn views: a WAI-ARIA tree with arrow keys, and every action has a button.
 */
export function OutlineView() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const settings = useTree((s) => s.tree!.settings);
  const persons = useTree((s) => s.persons);
  const loadingLinks = useTree(
    (s) => !s.fromServer.relationships && s.relationships.size === 0 && s.persons.size > 1,
  );
  const selectedId = useUi((s) => s.selectedId);
  const desktop = useIsDesktop();
  const { selfId } = useSelfPerson();
  const view = useDescendantView('list');
  const { graph, start, focusId, collapsed, descTree } = view;
  const change = useChange();

  const rows = useMemo(() => (descTree ? flattenOutline(descTree) : []), [descTree]);
  const indexByKey = useMemo(() => new Map(rows.map((row, i) => [row.key, i])), [rows]);
  const firstRowOf = useMemo(() => {
    const first = new Map<ID, OutlineRow>();
    for (const row of rows)
      if (!row.isRef && !first.has(row.personId)) first.set(row.personId, row);
    return first;
  }, [rows]);
  const branches = useMemo(() => (descTree ? branchOf(descTree) : new Map()), [descTree]);
  const unplaced = useMemo(() => unplacedPersons(graph, start ?? undefined), [graph, start]);
  const relativeOf = useCallback(
    (id: ID): Relative | null => {
      const person = persons.get(id);
      return person
        ? { name: displayName(person.names, settings.nameDisplay, locale), gender: person.gender }
        : null;
    },
    [persons, settings.nameDisplay, locale],
  );

  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ row: OutlineRow; family: ID[] } | null>(null);
  const [drop, setDrop] = useState<{ key: string; edge: 'before' | 'after' } | null>(null);
  const pendingFocus = useRef<PendingFocus | null>(null);
  const pendingReveal = useRef<ID | null>(null);
  const scrolledToSelection = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtual = rows.length > VIRTUALIZE_ABOVE;
  // The app doesn't use the React Compiler, which is what this rule protects.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 64,
    getItemKey: (index) => rows[index]?.key ?? index,
    overscan: 10,
    enabled: virtual,
  });

  const scrollToRow = useCallback(
    (key: string, align: 'center' | 'auto') => {
      const index = indexByKey.get(key);
      if (index === undefined) return;
      if (virtual) {
        virtualizer.scrollToIndex(index, { align });
        return;
      }
      scrollRef.current
        ?.querySelector(`[data-row-key="${CSS.escape(key)}"]`)
        ?.scrollIntoView({ block: align === 'center' ? 'center' : 'nearest' });
    },
    [indexByKey, virtual, virtualizer],
  );

  const toggle = useCallback(
    (key: string) => {
      const next = new Set(collapsed);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      uiStore.getState().setCollapsed('list', [...next]);
    },
    [collapsed],
  );

  const activate = useCallback((row: OutlineRow) => {
    // A repeated person jumps to where they first appear (VIS-09).
    if (row.isRef) uiStore.getState().reveal(row.personId);
    else uiStore.getState().select(row.personId);
  }, []);

  const move = useCallback(
    (row: OutlineRow, by: -1 | 1) => {
      const order = movedOrder(familyOf(rows, row), row.personId, by);
      if (!order || !row.parentId) return;
      const parentId = row.parentId;
      if (change((ctx) => reorderChildren(ctx, parentId, order))) {
        const active = document.activeElement?.getAttribute('data-move');
        pendingFocus.current = {
          key: row.key,
          ...((active === 'up' || active === 'down') && { part: active }),
        };
      }
    },
    [rows, change],
  );

  const onRowKey = useCallback(
    (event: KeyboardEvent<HTMLDivElement>, row: OutlineRow) => {
      if (event.target !== event.currentTarget) return;
      if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        event.preventDefault();
        move(row, event.key === 'ArrowUp' ? -1 : 1);
        return;
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activate(row);
        if (!row.isRef) uiStore.getState().setDetailsOpen(true);
        return;
      }
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const key = outlineKeyOf(event.key);
      const index = indexByKey.get(row.key);
      if (!key || index === undefined) return;
      const step = outlineStep(rows, index, key);
      if (!step) return;
      event.preventDefault();
      if (step.type !== 'move') {
        toggle(step.key);
        return;
      }
      const target = rows[step.index]!;
      uiStore.getState().select(target.personId);
      pendingFocus.current = { key: target.key };
      scrollToRow(target.key, 'auto');
    },
    [rows, indexByKey, move, activate, toggle, scrollToRow],
  );

  const onDragStart = useCallback(
    (row: OutlineRow, event: DragEvent<HTMLElement>) => {
      const family = familyOf(rows, row);
      if (family.length < 2) return;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', row.personId);
      setDrag({ row, family });
    },
    [rows],
  );

  const onDragOver = useCallback(
    (row: OutlineRow, event: DragEvent<HTMLDivElement>) => {
      if (!drag || !sameFamily(row, drag.row)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      const box = event.currentTarget.getBoundingClientRect();
      const edge = event.clientY < box.top + box.height / 2 ? 'before' : 'after';
      if (drop?.key !== row.key || drop.edge !== edge) setDrop({ key: row.key, edge });
    },
    [drag, drop],
  );

  const endDrag = useCallback(() => {
    setDrag(null);
    setDrop(null);
  }, []);

  const onDrop = useCallback(
    (row: OutlineRow, event: DragEvent<HTMLDivElement>) => {
      if (!drag || !drop || !sameFamily(row, drag.row) || !drag.row.parentId) return endDrag();
      event.preventDefault();
      const at = drag.family.indexOf(row.personId);
      const beforeId = drop.edge === 'before' ? row.personId : (drag.family[at + 1] ?? null);
      const order = droppedOrder(drag.family, drag.row.personId, beforeId);
      const parentId = drag.row.parentId;
      if (order) change((ctx) => reorderChildren(ctx, parentId, order));
      endDrag();
    },
    [drag, drop, change, endDrag],
  );

  // VIS-04: open the way to someone found by search, then bring their row into view.
  useRevealRequest('list', view, (personId) => {
    pendingReveal.current = personId;
  });

  // Coming from another view: show the selected person (P6-08).
  useEffect(() => {
    if (scrolledToSelection.current || rows.length === 0) return;
    scrolledToSelection.current = true;
    const selected = uiStore.getState().selectedId;
    const row = selected ? firstRowOf.get(selected) : undefined;
    if (row) scrollToRow(row.key, 'center');
  }, [rows, firstRowOf, scrollToRow]);

  // After every render: finish a reveal once its row exists, then move keyboard focus.
  useEffect(() => {
    const revealing = pendingReveal.current;
    const revealRow = revealing ? firstRowOf.get(revealing) : undefined;
    if (revealRow) {
      pendingReveal.current = null;
      scrollToRow(revealRow.key, 'center');
      pendingFocus.current = { key: revealRow.key };
    }
    const pending = pendingFocus.current;
    const element = pending
      ? scrollRef.current?.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(pending.key)}"]`)
      : null;
    if (!pending || !element) return;
    pendingFocus.current = null;
    const button = pending.part
      ? element.querySelector<HTMLButtonElement>(`[data-move="${pending.part}"]:not(:disabled)`)
      : null;
    (button ?? element).focus({ preventScroll: true });
  });

  if (!focusId || rows.length === 0) return null;
  const selectedRow = selectedId ? firstRowOf.get(selectedId) : undefined;
  const tabbableKey =
    (activeKey !== null && indexByKey.has(activeKey) ? activeKey : selectedRow?.key) ??
    rows[0]!.key;
  const focusParents = parentsOf(graph, focusId).flatMap((id) => graph.persons.get(id) ?? []);
  const upTo = focusParents.find((p) => p.gender === 'male') ?? focusParents[0];

  const renderRow = (
    row: OutlineRow,
    index: number,
    extra?: Partial<Parameters<typeof OutlineItem>[0]>,
  ) => {
    const person = graph.persons.get(row.personId);
    if (!person) return null;
    const family = row.parentKey === null ? [] : familyOf(rows, row);
    const at = family.indexOf(row.personId);
    const first = row.isRef ? firstRowOf.get(row.personId) : undefined;
    return (
      <OutlineItem
        key={row.key}
        row={row}
        index={index}
        person={person}
        relativeOf={relativeOf}
        accent={accentColor(settings.colorBy, {
          branch: branches.get(row.key) ?? null,
          generation: row.depth,
          gender: person.gender,
        })}
        selected={row.personId === selectedId}
        selectedId={selectedId}
        tabbable={row.key === tabbableKey}
        isSelf={row.personId === selfId}
        compact={!desktop}
        showDates={settings.showDates}
        firstNumber={first ? localNumber(first.number, locale) : null}
        canMoveUp={at > 0}
        canMoveDown={at >= 0 && at < family.length - 1}
        draggable={desktop && family.length > 1}
        dropEdge={drop?.key === row.key ? drop.edge : null}
        onActivate={activate}
        onToggle={toggle}
        onKeyDown={onRowKey}
        onFocusRow={setActiveKey}
        onMove={move}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragEnd={endDrag}
        {...extra}
      />
    );
  };

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b bg-background px-3 py-2">
        <ListModeSwitch />
        <FocusBanner focusId={focusId} start={start} className="max-w-full" />
        {upTo && (
          <Button
            variant="outline"
            size="sm"
            className="h-9 rounded-full"
            onClick={() => uiStore.getState().focus(upTo.id)}
          >
            <ArrowUpIcon aria-hidden /> {t('treeView.showParents')}
          </Button>
        )}
        {collapsed.size > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="h-9 rounded-full"
            onClick={() => uiStore.getState().setCollapsed('list', [])}
          >
            <ChevronsUpDownIcon aria-hidden /> {t('treeView.expandAll')}
          </Button>
        )}
        {loadingLinks && (
          <span role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircleIcon className="size-4 animate-spin" aria-hidden />
            {t('treeView.loading')}
          </span>
        )}
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto pb-24">
        <div
          role="tree"
          aria-label={t('listView.label')}
          className="relative mx-auto w-full max-w-3xl"
          style={virtual ? { height: virtualizer.getTotalSize() } : undefined}
        >
          {virtual
            ? virtualizer.getVirtualItems().map((item) =>
                renderRow(rows[item.index]!, item.index, {
                  measureRef: virtualizer.measureElement,
                  style: {
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${item.start}px)`,
                  },
                }),
              )
            : rows.map((row, index) => renderRow(row, index))}
        </div>
      </div>
      <UnplacedTray ids={unplaced} className="absolute right-3 bottom-3" />
    </div>
  );
}
