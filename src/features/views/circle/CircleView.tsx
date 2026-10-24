'use client';

import { arc as d3Arc } from 'd3-shape';
import { ChevronRightIcon, MinusIcon, PlusIcon, TargetIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import { Button } from '@/components/ui/button';
import { useIsDesktop } from '@/features/editor/shell/useIsDesktop';
import { usePersonText } from '@/features/editor/shell/usePersonText';
import { useShownPhoto } from '@/features/media/Avatar';
import { photoUrl } from '@/features/media/cloudinaryUrl';
import { useSelfPerson } from '@/features/person/useSelfPerson';
import { AvatarClip, AVATAR_CLIP } from '@/features/views/tree/PersonCard';
import { toolbarButton, TreeControls } from '@/features/views/tree/TreeControls';
import { UnplacedTray } from '@/features/views/tree/UnplacedTray';
import {
  buildDescendantTree,
  spouseLinksOf,
  unplacedPersons,
  walkDescendants,
} from '@/lib/domain/graph';
import { displayName, initials } from '@/lib/domain/names';
import type { ID, Locale, Person } from '@/lib/domain/types';
import { selectGraph, useTree } from '@/stores/treeStore';
import { MAX_CIRCLE_RINGS, MIN_CIRCLE_RINGS, uiStore, useUi } from '@/stores/uiStore';

import {
  CIRCLE_COMFORTABLE,
  CIRCLE_COMPACT,
  circleStep,
  circleStepOf,
  fitLabel,
  FULL_WINDOW,
  labelPath,
  layoutCircle,
  mixWindows,
  projectArc,
  radialLabel,
  windowOf,
  type CircleArc,
  type CircleLayout,
  type ZoomWindow,
} from './layout';
import { accentColor } from '../shared/colors';
import { LegendButton } from '../shared/Legend';
import { measureText, wrapText } from '../shared/measureText';
import { useCamera } from '../shared/useCamera';
import { useDescendantView, useRevealRequest } from '../shared/useDescendantView';
import { useElementSize } from '../shared/useElementSize';
import { useFonts } from '../shared/useFonts';
import { fitTransform } from '../shared/viewport';

/** The zoom into or out of a person (CV-03). */
const ZOOM_MS = 550;
/** Above this many arcs, re-centring jumps instead of animating. */
const ANIMATE_LIMIT = 400;

export type Geometry = Pick<CircleArc, 'a0' | 'a1' | 'r0' | 'r1'>;

export const arcPath = d3Arc<Geometry>()
  .startAngle((d) => d.a0)
  .endAngle((d) => d.a1)
  .innerRadius((d) => d.r0)
  .outerRadius((d) => d.r1)
  .padAngle((d) => Math.min((d.a1 - d.a0) / 4, 0.004))
  .cornerRadius(3);

/** Arcs are tints of the data colour, lighter further out (DESIGN §21.3). */
export function tint(accent: string | null, depth: number): string {
  if (!accent) return 'var(--muted)';
  const percent = Math.max(20, 55 - 8 * (depth - 1));
  return `color-mix(in oklab, ${accent} ${percent}%, var(--card))`;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

interface Zoom {
  layout: CircleLayout;
  from: ZoomWindow;
  to: ZoomWindow;
}

/**
 * The layout to draw and the zoom window: re-centring on someone in the circle zooms into
 * their slice, going back zooms out of it (the classic zoomable sunburst).
 */
function useZoom(layout: CircleLayout | null): { shown: CircleLayout | null; window: ZoomWindow } {
  const [previous, setPrevious] = useState(layout);
  const [zoom, setZoom] = useState<Zoom | null>(null);
  const [t, setT] = useState(0);

  if (previous !== layout) {
    setPrevious(layout);
    const oldCentre = previous?.rootKey.split('/').at(-1);
    const newCentre = layout?.rootKey.split('/').at(-1);
    let next: Zoom | null = null;
    if (previous && layout && oldCentre !== newCentre && !prefersReducedMotion()) {
      const into = previous.byKey.get(previous.firstOf.get(newCentre!) ?? '');
      const outOf = layout.byKey.get(layout.firstOf.get(oldCentre!) ?? '');
      if (into && previous.arcs.length <= ANIMATE_LIMIT) {
        next = { layout: previous, from: FULL_WINDOW, to: windowOf(into) };
      } else if (outOf && layout.arcs.length <= ANIMATE_LIMIT) {
        next = { layout, from: windowOf(outOf), to: FULL_WINDOW };
      }
    }
    setZoom(next);
    setT(0);
  }

  useEffect(() => {
    if (!zoom) return;
    let frame = 0;
    const startedAt = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / ZOOM_MS);
      if (progress >= 1) {
        setZoom(null);
        return;
      }
      setT(progress);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [zoom]);

  if (!zoom) return { shown: layout, window: FULL_WINDOW };
  return { shown: zoom.layout, window: mixWindows(zoom.from, zoom.to, ease(t)) };
}

export const ArcFor = memo(function ArcFor({
  arc,
  geometry,
  person,
  accent,
  selected,
  isSelf,
  tabbable,
  fontSize,
  fontFamily,
  onActivate,
  onCentre,
  onHover,
  onKeyDown,
}: {
  arc: CircleArc;
  geometry: Geometry;
  person: Person;
  accent: string | null;
  selected: boolean;
  isSelf: boolean;
  tabbable: boolean;
  fontSize: number;
  fontFamily: string;
  /** Changes when web fonts load, so names are measured again. */
  fontsVersion: number;
  onActivate: (arc: CircleArc) => void;
  onCentre: (personId: ID) => void;
  onHover: (personId: ID | null) => void;
  onKeyDown: (event: KeyboardEvent<SVGGElement>, key: string) => void;
}) {
  const t = useTranslations();
  const { name, years } = usePersonText(person);
  const font = `500 ${fontSize}px ${fontFamily}`;
  const width = measureText(name.text, font);
  const mode = fitLabel(geometry, width, fontSize);
  const pathId = `circle-label-${arc.key}`;
  const label = [
    arc.isRef ? t('treeView.reference', { name: name.text }) : name.text,
    years,
    !person.isLiving && t('treeView.deceased'),
    isSelf && t('treeView.you'),
  ]
    .filter(Boolean)
    .join(', ');
  const d = arcPath(geometry) ?? '';
  return (
    <g
      role="treeitem"
      aria-level={arc.depth + 1}
      aria-selected={selected}
      aria-label={label}
      tabIndex={tabbable ? 0 : -1}
      data-person-id={person.id}
      data-arc-key={arc.key}
      className="circle-arc cursor-pointer outline-none"
      onClick={(event) => {
        event.stopPropagation();
        onActivate(arc);
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onCentre(person.id);
      }}
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') onHover(person.id);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse') onHover(null);
      }}
      onKeyDown={(event) => onKeyDown(event, arc.key)}
    >
      <path
        d={d}
        style={{ fill: tint(accent, arc.depth) }}
        stroke="var(--background)"
        strokeWidth={2}
        strokeDasharray={arc.isRef ? '4 3' : undefined}
      />
      {arc.depth === 1 && accent && (
        <path
          aria-hidden
          d={arcPath({ ...geometry, r1: geometry.r0 + 3 }) ?? ''}
          style={{ fill: accent }}
        />
      )}
      {arc.more && (
        <path
          aria-hidden
          d={arcPath({ ...geometry, r0: geometry.r1 + 2, r1: geometry.r1 + 5 }) ?? ''}
          fill="var(--muted-foreground)"
        />
      )}
      {selected && (
        <path
          aria-hidden
          d={d}
          fill="none"
          stroke="var(--foreground)"
          strokeWidth={2.5}
          className="pointer-events-none"
        />
      )}
      <path aria-hidden d={d} fill="none" className="circle-focus pointer-events-none" />
      {mode === 'tangential' && (
        <>
          <path id={pathId} d={labelPath(geometry, fontSize)} fill="none" aria-hidden />
          <text
            aria-hidden
            className="pointer-events-none"
            fontSize={fontSize}
            fontWeight={500}
            fill="var(--foreground)"
            lang={name.lang}
          >
            <textPath href={`#${pathId}`} startOffset="50%" textAnchor="middle">
              {name.text}
            </textPath>
          </text>
        </>
      )}
      {mode === 'radial' && (
        <text
          aria-hidden
          className="pointer-events-none"
          transform={radialLabel(geometry).transform}
          x={radialLabel(geometry).x}
          dy="0.35em"
          fontSize={fontSize}
          fontWeight={500}
          fill="var(--foreground)"
          lang={name.lang}
        >
          {name.text}
        </text>
      )}
    </g>
  );
});

/**
 * The arcs while zooming: plain shapes without labels or handlers, so each frame is
 * cheap (the full arcs come back when the zoom ends).
 */
function ZoomFrame({
  layout,
  window,
  colorOf,
}: {
  layout: CircleLayout;
  window: ZoomWindow;
  colorOf: (arc: CircleArc) => string | null;
}) {
  return (
    <g aria-hidden className="pointer-events-none">
      {layout.arcs.map((arc) => {
        const geometry = projectArc(arc, window, layout.metrics);
        if (!geometry) return null;
        return (
          <path
            key={arc.key}
            d={arcPath(geometry) ?? ''}
            style={{ fill: tint(colorOf(arc), arc.depth) }}
            stroke="var(--background)"
            strokeWidth={2}
          />
        );
      })}
    </g>
  );
}

/** The focus person in the middle: photo or initials, and name (CV-07). */
export function CentreDisc({
  person,
  radius,
  fontFamily,
  selected,
  tabbable,
  onActivate,
  onKeyDown,
  photoVariant = 'thumb',
}: {
  person: Person;
  radius: number;
  fontFamily: string;
  selected: boolean;
  tabbable: boolean;
  onActivate: () => void;
  onKeyDown: (event: KeyboardEvent<SVGGElement>) => void;
  /** Exports use the canvas-safe variant, or none (P7). */
  photoVariant?: 'thumb' | 'export' | null;
}) {
  const t = useTranslations('circleView');
  const { name, years } = usePersonText(person);
  const photo = useShownPhoto(person.photo);
  const href = photo && photoVariant ? photoUrl(photo, photoVariant) : null;
  const avatar = radius * 0.42;
  const fontSize = radius > 56 ? 12 : 11;
  const lines = wrapText(name.text, {
    maxWidth: radius * 1.5,
    maxLines: 2,
    font: `600 ${fontSize}px ${fontFamily}`,
    locale: name.lang,
  });
  const avatarY = -radius * 0.28 - (lines.length > 1 ? fontSize * 0.5 : 0);
  return (
    <g
      role="treeitem"
      aria-level={1}
      aria-selected={selected}
      tabIndex={tabbable ? 0 : -1}
      data-person-id={person.id}
      data-arc-key="centre"
      className="circle-arc cursor-pointer outline-none"
      onClick={(event) => {
        event.stopPropagation();
        onActivate();
      }}
      onKeyDown={onKeyDown}
    >
      <circle
        r={radius - 3}
        fill="var(--card)"
        stroke={selected ? 'var(--foreground)' : 'var(--border)'}
        strokeWidth={selected ? 2.5 : 1}
      />
      <circle r={radius - 3} fill="none" className="circle-focus" />
      {/* The name for screen readers, from content: an aria-label would have to repeat the
          visible initials (axe label-content-name-mismatch). */}
      <text opacity={0} fontSize={1} className="pointer-events-none">
        {[t('inCentre', { name: name.text }), years].filter(Boolean).join(', ')}
      </text>
      <g aria-hidden transform={`translate(0, ${avatarY})`}>
        <circle r={avatar} fill="var(--muted)" />
        {href ? (
          <image
            href={href}
            x={-avatar}
            y={-avatar}
            width={avatar * 2}
            height={avatar * 2}
            clipPath={`url(#${AVATAR_CLIP})`}
            preserveAspectRatio="xMidYMid slice"
          />
        ) : (
          <text
            aria-hidden
            textAnchor="middle"
            dy="0.35em"
            fontSize={avatar * 0.7}
            fontWeight={600}
            fill="var(--foreground)"
            lang={name.lang}
          >
            {initials(name.text, name.lang)}
          </text>
        )}
      </g>
      {lines.map((line, i) => (
        <text
          key={i}
          aria-hidden
          y={avatarY + avatar + fontSize * 1.4 + i * fontSize * 1.6}
          textAnchor="middle"
          fontSize={fontSize}
          fontWeight={600}
          fill="var(--foreground)"
          lang={name.lang}
        >
          {line}
        </text>
      ))}
    </g>
  );
}

/** Who is under the pointer or selected: name, years, husbands or wives (CV-05). */
function InfoCard({ person, canCentre }: { person: Person; canCentre: boolean }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const desktop = useIsDesktop();
  const { name, years } = usePersonText(person);
  const graph = useTree(selectGraph);
  const nameDisplay = useTree((s) => s.tree?.settings.nameDisplay ?? 'auto');
  const spouses = spouseLinksOf(graph, person.id).flatMap((link) => {
    const other = link.personIds[0] === person.id ? link.personIds[1] : link.personIds[0];
    const spouse = graph.persons.get(other);
    return spouse ? [spouse] : [];
  });
  const spouseLines = spouses.map((spouse) =>
    t('listView.relation', {
      role: t('relatives.roles.spouse', { gender: spouse.gender }),
      name: displayName(spouse.names, nameDisplay, locale).text,
    }),
  );
  const centre = () => uiStore.getState().focus(person.id);
  if (!desktop) {
    // Phones show the selected person in the bar below; this adds the spouses and the
    // way to put them in the centre, in one line.
    return (
      <div className="pointer-events-auto flex w-full items-center gap-2 rounded-xl border bg-background/95 py-1.5 pr-1.5 pl-3 text-sm shadow-sm backdrop-blur">
        <p className="min-w-0 flex-1 truncate">
          <span lang={name.lang} className="font-semibold">
            {name.text}
          </span>
          {spouseLines.length > 0 && (
            <span className="text-muted-foreground"> · {spouseLines.join(' · ')}</span>
          )}
        </p>
        {canCentre && (
          <Button
            variant="outline"
            size="icon"
            className="size-11 shrink-0"
            aria-label={t('circleView.makeCentre', { name: name.text })}
            onClick={centre}
          >
            <TargetIcon aria-hidden />
          </Button>
        )}
      </div>
    );
  }
  return (
    <div className="pointer-events-auto w-full max-w-xs rounded-xl border bg-background/95 p-3 text-sm shadow-sm backdrop-blur">
      <p lang={name.lang} className="font-semibold">
        {name.text}
      </p>
      {years && <p className="text-muted-foreground tabular-nums">{years}</p>}
      {spouseLines.map((line) => (
        <p key={line} className="text-muted-foreground">
          {line}
        </p>
      ))}
      {canCentre && (
        <Button variant="outline" size="sm" className="mt-2 h-9" onClick={centre}>
          <TargetIcon aria-hidden /> {t('circleView.makeCentre', { name: name.text })}
        </Button>
      )}
    </div>
  );
}

/** The way from the tree's start to the centre person (CV-03). */
function Breadcrumbs({ path, start }: { path: readonly ID[]; start: ID | null }) {
  const t = useTranslations('circleView');
  const locale = useLocale() as Locale;
  const persons = useTree((s) => s.persons);
  const nameDisplay = useTree((s) => s.tree?.settings.nameDisplay ?? 'auto');
  if (path.length < 2) return null;
  return (
    <nav
      aria-label={t('breadcrumb')}
      className="pointer-events-auto max-w-full overflow-x-auto rounded-full border bg-background/95 px-2 py-1 shadow-sm backdrop-blur"
    >
      <ol className="flex items-center gap-1 text-sm whitespace-nowrap">
        {path.map((id, i) => {
          const person = persons.get(id);
          if (!person) return null;
          const shown = displayName(person.names, nameDisplay, locale);
          const last = i === path.length - 1;
          return (
            <li key={id} className="flex items-center gap-1">
              {i > 0 && <ChevronRightIcon aria-hidden className="size-4 text-muted-foreground" />}
              {last ? (
                <span aria-current="location" lang={shown.lang} className="px-1 font-semibold">
                  {shown.text}
                </span>
              ) : (
                <button
                  type="button"
                  lang={shown.lang}
                  className="h-8 rounded-full px-2 hover:bg-accent"
                  onClick={() => uiStore.getState().focus(id === start ? null : id)}
                >
                  {shown.text}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** "− 5 generations +" (CV-04). */
function RingsControl() {
  const t = useTranslations('circleView');
  const rings = useUi((s) => s.circleRings);
  return (
    <div className="flex items-center rounded-xl border bg-background/95 shadow-sm backdrop-blur">
      <Button
        variant="ghost"
        size="icon"
        className="size-11 rounded-l-xl rounded-r-none lg:size-10"
        aria-label={t('fewerRings')}
        disabled={rings <= MIN_CIRCLE_RINGS}
        onClick={() => uiStore.getState().setCircleRings(rings - 1)}
      >
        <MinusIcon aria-hidden />
      </Button>
      <span aria-live="polite" className="px-1 text-sm tabular-nums">
        {t('rings', { count: rings })}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="size-11 rounded-l-none rounded-r-xl lg:size-10"
        aria-label={t('moreRings')}
        disabled={rings >= MAX_CIRCLE_RINGS}
        onClick={() => uiStore.getState().setCircleRings(rings + 1)}
      >
        <PlusIcon aria-hidden />
      </Button>
    </div>
  );
}

/**
 * The Circle view (CV-01..07, DESIGN §13.4): the focus person in the centre and each
 * generation as a ring of arcs. Tap selects; double-tap or "Put … in the centre" zooms
 * into that person, and the breadcrumb leads back.
 */
export function CircleView() {
  const t = useTranslations('circleView');
  const settings = useTree((s) => s.tree!.settings);
  const treeId = useTree((s) => s.treeId);
  const selectedId = useUi((s) => s.selectedId);
  const rings = useUi((s) => s.circleRings);
  const desktop = useIsDesktop();
  const metrics = desktop ? CIRCLE_COMFORTABLE : CIRCLE_COMPACT;
  const { selfId } = useSelfPerson();
  const view = useDescendantView('circle', { maxDepth: rings, collapsible: false });
  const { graph, start, focusId, descTree } = view;

  const layout = useMemo(
    () => (descTree ? layoutCircle(descTree, metrics) : null),
    [descTree, metrics],
  );
  const { shown, window } = useZoom(layout);
  const zooming = window !== FULL_WINDOW;
  const unplaced = useMemo(() => unplacedPersons(graph, start ?? undefined), [graph, start]);
  // The way from the start to the centre, for the breadcrumb.
  const path = useMemo(() => {
    if (!start || !focusId || start === focusId) return focusId ? [focusId] : [];
    const full = buildDescendantTree(graph, start);
    let found: string | null = null;
    if (full) {
      walkDescendants(full, (node) => {
        if (!found && node.personId === focusId && !node.isRef) found = node.key;
      });
    }
    return found ? (found as string).split('/') : [start, focusId];
  }, [graph, start, focusId]);

  const [hoverId, setHoverId] = useState<ID | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const pendingFocus = useRef<string | null>(null);
  const pendingReveal = useRef<ID | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const layerRef = useRef<SVGGElement>(null);
  const size = useElementSize(containerRef);
  const camera = useCamera(svgRef, layerRef);
  const { moveTo } = camera;
  const fonts = useFonts(svgRef);

  // Frame the circle when it opens or the centre, depth or screen changes, and keep
  // framing it while the family loads until the user moves it.
  const radius = layout?.radius ?? metrics.centre;
  const fitKey = `${treeId}|${focusId}|${rings}|${desktop}`;
  const fitted = useRef<string | null>(null);
  const { interacted, resetInteraction } = camera;
  const frame = useCallback(
    (animate: boolean) => {
      const r = radius + 8;
      moveTo(
        fitTransform({ minX: -r, minY: -r, maxX: r, maxY: r }, size, {
          padding: desktop ? 32 : 12,
          minScale: 0.2,
          maxScale: 1.4,
        }),
        animate,
      );
    },
    [radius, size, desktop, moveTo],
  );
  useEffect(() => {
    if (size.width === 0) return;
    const fresh = fitted.current !== fitKey;
    if (!fresh && interacted()) return;
    if (fresh) resetInteraction();
    const first = fitted.current === null;
    fitted.current = fitKey;
    frame(fresh && !first);
  }, [fitKey, size.width, frame, interacted, resetInteraction]);

  const colorOf = useCallback(
    (arc: CircleArc) =>
      accentColor(settings.colorBy, {
        branch: arc.branch,
        generation: arc.depth,
        gender: graph.persons.get(arc.personId)?.gender ?? 'unknown',
      }),
    [settings.colorBy, graph],
  );

  const activate = useCallback((arc: CircleArc) => {
    uiStore.getState().select(arc.personId);
    setActiveKey(arc.key);
  }, []);
  const centreOn = useCallback((personId: ID) => {
    uiStore.getState().focus(personId);
    uiStore.getState().select(personId);
  }, []);

  const onKey = useCallback(
    (event: KeyboardEvent<SVGGElement>, key: string) => {
      if (!layout) return;
      const arcKey = key === 'centre' ? layout.rootKey : key;
      const personId = key === 'centre' ? focusId : layout.byKey.get(key)?.personId;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (!personId) return;
        uiStore.getState().select(personId);
        uiStore.getState().setDetailsOpen(true);
        return;
      }
      const step = circleStepOf(event.key);
      if (!step) return;
      event.preventDefault();
      const target = circleStep(layout, arcKey, step);
      if (!target) return;
      const domKey = target === layout.rootKey ? 'centre' : target;
      const targetPerson = target === layout.rootKey ? focusId : layout.byKey.get(target)?.personId;
      if (targetPerson) uiStore.getState().select(targetPerson);
      setActiveKey(domKey);
      pendingFocus.current = domKey;
    },
    [layout, focusId],
  );

  // VIS-04: show someone found by search, re-centring on their parent if they are
  // beyond the outer ring.
  useRevealRequest('circle', view, (personId) => {
    pendingReveal.current = personId;
  });

  useEffect(() => {
    const revealing = pendingReveal.current;
    if (revealing && layout && !zooming) {
      const key = revealing === focusId ? 'centre' : layout.firstOf.get(revealing);
      if (key && (key === 'centre' || layout.byKey.has(key))) {
        pendingReveal.current = null;
        pendingFocus.current = key;
      } else if (focusId) {
        const full = buildDescendantTree(graph, focusId);
        let parentId: ID | null = null;
        if (full) {
          walkDescendants(full, (node, parent) => {
            if (!parentId && node.personId === revealing && !node.isRef && parent) {
              parentId = parent.personId;
            }
          });
        }
        if (parentId) uiStore.getState().focus(parentId);
        else pendingReveal.current = null;
      }
    }
    const key = pendingFocus.current;
    const element =
      key && svgRef.current?.querySelector<SVGGElement>(`[data-arc-key="${CSS.escape(key)}"]`);
    if (element) {
      pendingFocus.current = null;
      element.focus({ preventScroll: true });
    }
  });

  if (!shown || !focusId) return null;
  const centrePerson = graph.persons.get(focusId);
  if (!centrePerson) return null;
  const selectedKey = selectedId ? shown.firstOf.get(selectedId) : undefined;
  const tabbableKey =
    activeKey && (activeKey === 'centre' || shown.byKey.has(activeKey))
      ? activeKey
      : selectedId === focusId
        ? 'centre'
        : (selectedKey ?? 'centre');
  const cardId = hoverId ?? selectedId;
  const cardPerson = cardId ? graph.persons.get(cardId) : undefined;
  const cardShown = cardPerson && (cardId === focusId || shown.firstOf.has(cardPerson.id));

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-background">
      <svg
        ref={svgRef}
        className="h-full w-full touch-none font-sans select-none"
        role="tree"
        aria-label={t('label')}
        onClick={() => uiStore.getState().select(null)}
      >
        <defs>
          <AvatarClip />
        </defs>
        <g ref={layerRef}>
          {zooming ? (
            <ZoomFrame layout={shown} window={window} colorOf={colorOf} />
          ) : (
            shown.arcs.map((arc) => {
              const person = graph.persons.get(arc.personId);
              if (!person) return null;
              return (
                <ArcFor
                  key={arc.key}
                  arc={arc}
                  geometry={arc}
                  person={person}
                  accent={colorOf(arc)}
                  selected={arc.personId === selectedId && arc.key === selectedKey}
                  isSelf={arc.personId === selfId}
                  tabbable={arc.key === tabbableKey}
                  fontSize={shown.metrics.fontSize}
                  fontFamily={fonts.family}
                  fontsVersion={fonts.version}
                  onActivate={activate}
                  onCentre={centreOn}
                  onHover={setHoverId}
                  onKeyDown={onKey}
                />
              );
            })
          )}
          {/* The 12 o'clock seam: where the reading order starts (DESIGN §21.3). */}
          {shown.arcs.length > 0 && (
            <line
              aria-hidden
              x1={0}
              y1={-metrics.centre}
              x2={0}
              y2={-(shown.radius + 6)}
              stroke="var(--background)"
              strokeWidth={6}
              className="pointer-events-none"
            />
          )}
          <CentreDisc
            person={centrePerson}
            radius={metrics.centre}
            fontFamily={fonts.family}
            selected={selectedId === focusId}
            tabbable={tabbableKey === 'centre'}
            onActivate={() => {
              uiStore.getState().select(focusId);
              setActiveKey('centre');
            }}
            onKeyDown={(event) => onKey(event, 'centre')}
          />
        </g>
      </svg>

      <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-col items-start gap-2 lg:flex-row lg:justify-between">
        <Breadcrumbs path={path} start={start} />
        {cardShown && <InfoCard person={cardPerson} canCentre={cardPerson.id !== focusId} />}
      </div>

      <p className="sr-only">{t('centreHint')}</p>

      <div className="absolute bottom-3 left-3 flex items-end gap-2">
        <TreeControls
          className="static"
          orientation={false}
          onZoomIn={() => camera.zoomBy(1.25)}
          onZoomOut={() => camera.zoomBy(0.8)}
          onFit={() => frame(true)}
        >
          <LegendButton
            heads={descTree?.children.map((child) => child.personId) ?? []}
            generations={shown.rings + 1}
            className={toolbarButton}
          />
        </TreeControls>
        <RingsControl />
      </div>
      <UnplacedTray ids={unplaced} className="absolute right-3 bottom-3" />
    </div>
  );
}
