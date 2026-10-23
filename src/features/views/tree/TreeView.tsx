'use client';

import { ArrowUpIcon, LoaderCircleIcon, MinusIcon, PlusIcon } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import { Button } from '@/components/ui/button';
import { useIsDesktop } from '@/features/editor/shell/useIsDesktop';
import { usePersonText } from '@/features/editor/shell/usePersonText';
import { acceptsShortcuts, editorShortcut } from '@/features/editor/shortcuts';
import { useShownPhoto } from '@/features/media/Avatar';
import { photoUrl } from '@/features/media/cloudinaryUrl';
import { startAdd } from '@/features/person/AddRelativeFlows';
import { useSelfPerson } from '@/features/person/useSelfPerson';
import {
  branchOf,
  buildDescendantTree,
  parentsOf,
  reachableFrom,
  unplacedPersons,
  type FamilyGraph,
} from '@/lib/domain/graph';
import { displayName } from '@/lib/domain/names';
import type { ID, Locale, Person } from '@/lib/domain/types';
import { selectGraph, useTree } from '@/stores/treeStore';
import { uiStore, useUi } from '@/stores/uiStore';

import { COMFORTABLE, COMPACT, layoutTree, type LaidCard, type TreeLayout } from './layout';
import { createNavigator, stepFor } from './navigation';
import { AvatarClip, PersonCard } from './PersonCard';
import { PersonMenu } from './PersonMenu';
import { TreeControls } from './TreeControls';
import { UnplacedTray } from './UnplacedTray';
import { initialCollapsed, keysToReveal } from '../shared/collapse';
import { accentColor } from '../shared/colors';
import { useCamera } from '../shared/useCamera';
import { useElementSize } from '../shared/useElementSize';
import { useFonts } from '../shared/useFonts';
import {
  centreTransform,
  fitTransform,
  initialView,
  intersects,
  visibleRect,
} from '../shared/viewport';

/** Above this many visible cards, position changes are not animated (TV-05). */
const ANIMATE_LIMIT = 300;

/** The tree's start: its root, or the oldest-added person without parents. */
export function startingPerson(g: FamilyGraph, rootId: ID | undefined): ID | null {
  if (rootId && g.persons.has(rootId)) return rootId;
  const people = [...g.persons.values()].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
  return (people.find((p) => parentsOf(g, p.id).length === 0) ?? people[0])?.id ?? null;
}

// Memoized so a pan or zoom only renders the cards that came into view (P4-13).
const CardFor = memo(function CardFor({
  card,
  person,
  layout,
  accent,
  selected,
  isSelf,
  compact,
  fonts,
  showDates,
  tabbable,
  onActivate,
  onKeyDown,
}: {
  card: LaidCard;
  person: Person;
  layout: TreeLayout;
  accent: string | null;
  selected: boolean;
  isSelf: boolean;
  compact: boolean;
  fonts: { family: string; version: number };
  showDates: boolean;
  tabbable: boolean;
  onActivate: (card: LaidCard) => void;
  onKeyDown: (event: KeyboardEvent<SVGGElement>, card: LaidCard) => void;
}) {
  const t = useTranslations('treeView');
  const { name, years } = usePersonText(person);
  const photo = useShownPhoto(person.photo);
  const shownYears = showDates ? years : '';
  const deceased = !person.isLiving;
  const label = [name.text, shownYears, deceased && t('deceased'), isSelf && t('you')]
    .filter(Boolean)
    .join(', ');
  const isRepeated = card.isRef || (layout.cardsOf.get(person.id)?.length ?? 0) > 1;
  const linkLabel = card.isRef
    ? t('reference', { name: name.text })
    : card.isAlsoBloodline || isRepeated
      ? t('alsoBloodline')
      : null;
  return (
    <PersonCard
      card={card}
      name={name}
      years={shownYears}
      deceased={deceased}
      accent={accent}
      selected={selected}
      isSelf={isSelf}
      photoHref={photo ? photoUrl(photo, 'thumb') : null}
      compact={compact}
      fontFamily={fonts.family}
      fontsVersion={fonts.version}
      label={card.isRef ? t('reference', { name: name.text }) : label}
      linkLabel={linkLabel}
      tabbable={tabbable}
      onActivate={onActivate}
      onKeyDown={onKeyDown}
    />
  );
});

/**
 * Every connector of the tree. They aren't culled, so they're memoized: a pan or zoom
 * re-renders the cards without diffing thousands of paths (P4-13).
 */
const Connectors = memo(function Connectors({ lines }: { lines: TreeLayout['lines'] }) {
  return (
    <g fill="none" stroke="var(--connector)" strokeWidth={1.5} aria-hidden>
      {lines.map((line) => (
        <path key={line.key} d={line.d} strokeDasharray={line.dashed ? '6 5' : undefined} />
      ))}
      {lines.map(
        (line) =>
          line.ring && (
            <circle
              key={`r:${line.key}`}
              cx={line.ring[0]}
              cy={line.ring[1]}
              r={4}
              fill="var(--background)"
            />
          ),
      )}
    </g>
  );
});

/** The "−" or "+N" control under a person with descendants (VIS-02). */
const Toggle = memo(function Toggle({
  card,
  personName,
  onToggle,
}: {
  card: LaidCard;
  personName: string;
  onToggle: (key: string) => void;
}) {
  const t = useTranslations('treeView');
  const format = useFormatter();
  const toggle = card.toggle!;
  const text = toggle.collapsed ? `+${format.number(toggle.hiddenCount)}` : '';
  const width = toggle.collapsed ? Math.max(28, 14 + text.length * 8) : 22;
  return (
    <g
      className="tree-toggle"
      role="button"
      tabIndex={-1}
      aria-label={t(toggle.collapsed ? 'showDescendants' : 'hideDescendants', { name: personName })}
      aria-expanded={!toggle.collapsed}
      style={{ transform: `translate(${toggle.x}px, ${toggle.y}px)`, cursor: 'pointer' }}
      onClick={(event) => {
        event.stopPropagation();
        onToggle(card.nodeKey);
      }}
    >
      {/* A bigger invisible target for fingers. */}
      <rect x={-22} y={-22} width={44} height={44} fill="transparent" />
      <rect
        x={-width / 2}
        y={-11}
        width={width}
        height={22}
        rx={11}
        fill={toggle.collapsed ? 'var(--primary)' : 'var(--background)'}
        stroke={toggle.collapsed ? 'none' : 'var(--border)'}
      />
      {toggle.collapsed ? (
        <text
          y={0}
          dy="0.35em"
          textAnchor="middle"
          fontSize={12}
          fontWeight={600}
          fill="var(--primary-foreground)"
        >
          {text}
        </text>
      ) : (
        <MinusIcon x={-7} y={-7} width={14} height={14} color="var(--muted-foreground)" />
      )}
    </g>
  );
});

/**
 * The Tree view (TV-01..05, DESIGN §13.3): the focus person's descendants as a tidy
 * tree of family units, with pan and zoom, expand/collapse, selection and focus.
 */
export function TreeView() {
  const t = useTranslations('treeView');
  const tr = useTranslations('relatives');
  const locale = useLocale() as Locale;
  const graph = useTree(selectGraph);
  const settings = useTree((s) => s.tree!.settings);
  const rootId = useTree((s) => s.tree?.rootPersonId);
  const treeId = useTree((s) => s.treeId);
  // Relationships still on their way (a big tree on a cold start): say so.
  const loadingLinks = useTree(
    (s) => !s.fromServer.relationships && s.relationships.size === 0 && s.persons.size > 1,
  );
  const focusSetting = useUi((s) => s.focusId);
  const selectedId = useUi((s) => s.selectedId);
  const saved = useUi((s) => s.collapsed.tree);
  const orientation = useUi((s) => s.orientation);
  const revealRequest = useUi((s) => s.revealRequest);
  const desktop = useIsDesktop();
  const metrics = desktop ? COMFORTABLE : COMPACT;
  const { selfId } = useSelfPerson();

  const start = startingPerson(graph, rootId);
  const focusId = focusSetting && graph.persons.has(focusSetting) ? focusSetting : start;

  // Without a saved state, big trees open a few generations deep (§13.1).
  const collapsed = useMemo(() => {
    if (saved) return new Set(saved);
    const full = focusId ? buildDescendantTree(graph, focusId) : null;
    return new Set(full ? initialCollapsed(full) : []);
  }, [saved, graph, focusId]);
  const descTree = useMemo(
    () => (focusId ? buildDescendantTree(graph, focusId, { collapsed }) : null),
    [graph, focusId, collapsed],
  );
  const layout = useMemo(
    () => (descTree ? layoutTree(descTree, metrics, orientation) : null),
    [descTree, metrics, orientation],
  );
  const branches = useMemo(() => (descTree ? branchOf(descTree) : new Map()), [descTree]);
  const navigate = useMemo(
    () => (layout ? createNavigator(layout, orientation) : null),
    [layout, orientation],
  );
  const unplaced = useMemo(() => unplacedPersons(graph, start ?? undefined), [graph, start]);
  // The card keyboard focus is on (roving tabindex), and work left for after a render.
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const pendingFocus = useRef<string | null>(null);
  const pendingReveal = useRef<ID | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const layerRef = useRef<SVGGElement>(null);
  const size = useElementSize(containerRef);
  const camera = useCamera(svgRef, layerRef);
  // The camera's functions are stable; only `transform` changes.
  const { moveTo, current, interacted, markInteracted, resetInteraction } = camera;
  const fonts = useFonts(svgRef);

  // Frame the tree when it opens, the focus or direction changes, or the card size does,
  // and keep framing it while it loads until the user moves or changes anything.
  const fitted = useRef<string | null>(null);
  const fitKey = `${treeId}|${focusId}|${orientation}|${desktop}`;
  useEffect(() => {
    if (!layout || size.width === 0) return;
    const fresh = fitted.current !== fitKey;
    if (!fresh && interacted()) return;
    if (fresh) resetInteraction();
    fitted.current = fitKey;
    const anchor = layout.cards.find((c) => c.key === focusId);
    moveTo(
      initialView(
        layout.bounds,
        size,
        anchor
          ? orientation === 'vertical'
            ? { x: anchor.x + anchor.w / 2, y: anchor.y }
            : { x: anchor.x, y: anchor.y + anchor.h / 2 }
          : { x: 0, y: 0 },
        { minScale: desktop ? 0.5 : 0.7, horizontal: orientation === 'horizontal' },
      ),
      false,
    );
  }, [layout, size, fitKey, focusId, orientation, desktop, moveTo, interacted, resetInteraction]);

  // Cards on screen, plus the active and selected ones so keyboard focus can reach them.
  const visible = useMemo(() => {
    if (!layout || size.width === 0) return [];
    const rect = visibleRect(camera.transform, size);
    const keep = new Set([activeKey, selectedId && layout.cardsOf.get(selectedId)?.[0]]);
    return layout.cards.filter((card) => keep.has(card.key) || intersects(card, rect));
  }, [layout, camera.transform, size, activeKey, selectedId]);

  const toggle = useCallback(
    (key: string) => {
      markInteracted();
      const next = new Set(collapsed);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      uiStore.getState().setCollapsed('tree', [...next]);
    },
    [collapsed, markInteracted],
  );

  // The canvas as it is now: the details panel may have just opened beside it, before
  // `size` catches up.
  const liveSize = useCallback(() => {
    const element = containerRef.current;
    return element ? { width: element.clientWidth, height: element.clientHeight } : size;
  }, [size]);

  const centreOnCard = useCallback(
    (key: string) => {
      const card = layout?.cards.find((c) => c.key === key);
      const now = liveSize();
      if (!card || now.width === 0) return;
      const k = Math.max(current().k, 0.6);
      moveTo(centreTransform({ x: card.x + card.w / 2, y: card.y + card.h / 2 }, now, k));
    },
    [layout, liveSize, current, moveTo],
  );

  /** Centres a card that isn't fully on screen. */
  const ensureVisible = useCallback(
    (card: LaidCard) => {
      const { x, y, k } = current();
      const now = liveSize();
      const margin = 24;
      const left = card.x * k + x;
      const top = card.y * k + y;
      const inside =
        left >= margin &&
        top >= margin &&
        left + card.w * k <= now.width - margin &&
        top + card.h * k <= now.height - margin;
      if (!inside) centreOnCard(card.key);
    },
    [current, liveSize, centreOnCard],
  );

  const activate = useCallback(
    (card: LaidCard) => {
      markInteracted();
      uiStore.getState().select(card.personId);
      setActiveKey(card.key);
      // A repeated person jumps to their full card (VIS-09).
      if (card.isRef) {
        const primary = layout?.cardsOf.get(card.personId)?.[0];
        if (primary) {
          setActiveKey(primary);
          pendingFocus.current = primary;
          centreOnCard(primary);
        }
      }
    },
    [layout, centreOnCard, markInteracted],
  );

  // TV-09: arrows move between parents, children and the people beside them.
  const onCardKey = useCallback(
    (event: KeyboardEvent<SVGGElement>, card: LaidCard) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activate(card);
        uiStore.getState().setDetailsOpen(true);
        return;
      }
      const step = stepFor(event.key, orientation);
      if (!step || !navigate) return;
      event.preventDefault();
      const target = navigate(card, step);
      if (!target) return;
      markInteracted();
      uiStore.getState().select(target.personId);
      setActiveKey(target.key);
      pendingFocus.current = target.key;
      ensureVisible(target);
    },
    [activate, orientation, navigate, markInteracted, ensureVisible],
  );

  const fit = useCallback(() => {
    if (layout) moveTo(fitTransform(layout.bounds, size));
  }, [layout, size, moveTo]);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || !acceptsShortcuts(event.target)) return;
      if (editorShortcut(event) !== 'fit') return;
      event.preventDefault();
      fit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fit]);

  // VIS-04: show the tree from where it starts (or from the person, when it doesn't reach
  // them), open the branches on the way, then centre them once they're laid out.
  useEffect(() => {
    if (!revealRequest) return;
    const ui = uiStore.getState();
    ui.revealDone();
    const { personId } = revealRequest;
    if (!graph.persons.has(personId)) return;
    const shows = (from: ID | null): from is ID =>
      from !== null && reachableFrom(graph, from).has(personId);
    const from = shows(focusId) ? focusId : shows(start) ? start : personId;
    if (from !== focusId) ui.focus(from === start ? null : from);
    const full = buildDescendantTree(graph, from);
    const open = full ? keysToReveal(full, personId) : null;
    const base = ui.collapsed.tree ?? (full ? initialCollapsed(full) : []);
    const next = open ? base.filter((key) => !open.includes(key)) : base;
    if (next.length !== base.length) ui.setCollapsed('tree', next);
    pendingReveal.current = personId;
  }, [revealRequest, graph, focusId, start]);

  // After every render: finish a reveal once its card exists, then move keyboard focus.
  useEffect(() => {
    const revealing = pendingReveal.current;
    const revealKey = revealing && layout?.cardsOf.get(revealing)?.[0];
    if (revealKey) {
      pendingReveal.current = null;
      markInteracted();
      centreOnCard(revealKey);
      pendingFocus.current = revealKey;
    }
    const key = pendingFocus.current;
    const element =
      key && svgRef.current?.querySelector<SVGGElement>(`[data-card-key="${CSS.escape(key)}"]`);
    if (element) {
      pendingFocus.current = null;
      element.focus({ preventScroll: true });
    }
  });

  if (!layout || !focusId) return null;
  const focusPerson = graph.persons.get(focusId)!;
  const focusParents = parentsOf(graph, focusId).flatMap((id) => graph.persons.get(id) ?? []);
  const focusCard = layout.cards.find((c) => c.key === focusId)!;
  const selectedKeys = selectedId ? layout.cardsOf.get(selectedId) : undefined;
  const tabbableKey =
    (activeKey && selectedKeys?.includes(activeKey) ? activeKey : selectedKeys?.[0]) ??
    layout.cards[0]?.key ??
    null;
  const animate = visible.length <= ANIMATE_LIMIT;
  const nameOf = (id: ID) => {
    const person = graph.persons.get(id);
    return person ? displayName(person.names, settings.nameDisplay, locale).text : '';
  };
  // Show the parents' tree: the father first, as the tree's root usually is.
  const upTo = focusParents.find((p) => p.gender === 'male') ?? focusParents[0];

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-background">
      <PersonMenu>
        <svg
          ref={svgRef}
          className={`h-full w-full touch-none font-sans select-none ${animate ? 'tree-animate' : ''}`}
          role="tree"
          aria-label={t('label')}
        >
          <defs>
            <AvatarClip />
          </defs>
          <g ref={layerRef}>
            <Connectors lines={layout.lines} />
            {upTo && focusCard && (
              <g
                className="tree-toggle"
                role="button"
                tabIndex={-1}
                aria-label={t('showParents')}
                style={{
                  transform: `translate(${focusCard.x + focusCard.w / 2}px, ${focusCard.y - 18}px)`,
                  cursor: 'pointer',
                }}
                onClick={() => uiStore.getState().focus(upTo.id)}
              >
                <rect x={-22} y={-22} width={44} height={44} fill="transparent" />
                <circle r={12} fill="var(--background)" stroke="var(--border)" />
                <ArrowUpIcon x={-7} y={-7} width={14} height={14} color="var(--muted-foreground)" />
              </g>
            )}
            {visible.map((card) => {
              const person = graph.persons.get(card.personId);
              if (!person) return null;
              const accent = accentColor(settings.colorBy, {
                branch: branches.get(card.nodeKey) ?? null,
                generation: card.depth,
                gender: person.gender,
              });
              return (
                <CardFor
                  key={card.key}
                  card={card}
                  person={person}
                  layout={layout}
                  accent={accent}
                  selected={card.personId === selectedId}
                  isSelf={card.personId === selfId}
                  compact={!desktop}
                  fonts={fonts}
                  showDates={settings.showDates}
                  tabbable={card.key === tabbableKey}
                  onActivate={activate}
                  onKeyDown={onCardKey}
                />
              );
            })}
            {visible.map(
              (card) =>
                card.toggle && (
                  <Toggle
                    key={`t:${card.key}`}
                    card={card}
                    personName={nameOf(card.personId)}
                    onToggle={toggle}
                  />
                ),
            )}
            {visible.map(
              (card) =>
                card.personId === selectedId &&
                !card.isRef && (
                  <g
                    key={`a:${card.key}`}
                    className="tree-toggle"
                    role="button"
                    tabIndex={-1}
                    data-add-for={card.personId}
                    aria-label={tr('menuTitle', { name: nameOf(card.personId) })}
                    style={{
                      transform: `translate(${card.x + card.w - 20}px, ${card.y + card.h + 2}px)`,
                      cursor: 'pointer',
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      markInteracted();
                      startAdd(card.personId, 'menu', event.currentTarget.getBoundingClientRect());
                    }}
                  >
                    <rect x={-22} y={-22} width={44} height={44} fill="transparent" />
                    <circle r={14} fill="var(--primary)" />
                    <PlusIcon
                      x={-9}
                      y={-9}
                      width={18}
                      height={18}
                      color="var(--primary-foreground)"
                    />
                  </g>
                ),
            )}
          </g>
        </svg>
      </PersonMenu>

      {focusId !== start && start && (
        <div className="absolute top-3 left-3 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-2 rounded-full border bg-background/95 py-1 pr-1 pl-3 text-sm shadow-sm">
          <span className="truncate">
            {t.rich('showingFrom', {
              name: nameOf(focusId),
              person: (chunks) => (
                <strong lang={displayName(focusPerson.names, settings.nameDisplay, locale).lang}>
                  {chunks}
                </strong>
              ),
            })}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-full"
            onClick={() => uiStore.getState().focus(null)}
          >
            {t('backTo', { name: nameOf(start) })}
          </Button>
        </div>
      )}

      {loadingLinks && (
        <div
          role="status"
          className="absolute top-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-background/95 px-3 py-1.5 text-sm shadow-sm"
        >
          <LoaderCircleIcon className="size-4 animate-spin" aria-hidden />
          {t('loading')}
        </div>
      )}

      <p aria-live="polite" className="sr-only">
        {selectedKeys ? t('selected', { name: nameOf(selectedId!) }) : ''}
      </p>

      <UnplacedTray ids={unplaced} className="absolute right-3 bottom-3" />

      <TreeControls
        onZoomIn={() => camera.zoomBy(1.25)}
        onZoomOut={() => camera.zoomBy(0.8)}
        onFit={fit}
        onCentre={
          selectedId && layout.cardsOf.get(selectedId)
            ? () => centreOnCard(layout.cardsOf.get(selectedId)![0]!)
            : undefined
        }
        onExpandAll={
          collapsed.size > 0 ? () => uiStore.getState().setCollapsed('tree', []) : undefined
        }
      />
    </div>
  );
}
