'use client';

import { useFormatter } from 'next-intl';
import { useMemo, useRef, useState } from 'react';

import { usePersonText } from '@/features/editor/shell/usePersonText';
import { useShownPhoto } from '@/features/media/Avatar';
import { photoUrl } from '@/features/media/cloudinaryUrl';
import { useSelfPerson } from '@/features/person/useSelfPerson';
import { accentColor } from '@/features/views/shared/colors';
import { useLegendEntries } from '@/features/views/shared/Legend';
import { useDescendantView } from '@/features/views/shared/useDescendantView';
import { COMFORTABLE, layoutTree, type LaidCard } from '@/features/views/tree/layout';
import { layoutPedigree } from '@/features/views/tree/pedigree';
import { AvatarClip, PersonCard } from '@/features/views/tree/PersonCard';
import { Connectors } from '@/features/views/tree/TreeView';
import { branchOf, buildAncestorTree, buildDescendantTree } from '@/lib/domain/graph';
import type { Person } from '@/lib/domain/types';
import { useTree } from '@/stores/treeStore';
import { useUi } from '@/stores/uiStore';

import { useSceneFonts, useWhenPainted, type SceneProps } from './scene';
import { SceneFrame, useExportDate } from './SceneFrame';

/** The name size of desktop cards (PersonCard's comfortable style). */
const COMFORTABLE_NAME_PX = 14;
/** Room around the cards for the "+N" pills under folded people. */
const MARGIN = 24;
const NOOP = () => {};

function SceneCard({
  card,
  person,
  accent,
  isSelf,
  photos,
  family,
}: {
  card: LaidCard;
  person: Person;
  accent: string | null;
  isSelf: boolean;
  photos: boolean;
  family: string;
}) {
  const showDates = useTree((s) => s.tree?.settings.showDates ?? true);
  const { name, years } = usePersonText(person);
  const photo = useShownPhoto(person.photo);
  return (
    <PersonCard
      card={card}
      name={name}
      years={showDates ? years : ''}
      deceased={!person.isLiving}
      accent={accent}
      selected={false}
      isSelf={isSelf}
      photoHref={photos && photo ? photoUrl(photo, 'export') : null}
      compact={false}
      fontFamily={family}
      fontsVersion={0}
      label=""
      linkLabel={null}
      tabbable={false}
      onActivate={NOOP}
    />
  );
}

/** A folded person's "+N", as a label: nothing to press on paper. */
function HiddenCount({ card }: { card: LaidCard }) {
  const format = useFormatter();
  const toggle = card.toggle;
  if (!toggle?.collapsed) return null;
  const text = `+${format.number(toggle.hiddenCount)}`;
  const width = Math.max(28, 14 + text.length * 8);
  return (
    <g transform={`translate(${toggle.x}, ${toggle.y})`}>
      <rect x={-width / 2} y={-11} width={width} height={22} rx={11} fill="var(--primary)" />
      <text
        dy="0.35em"
        textAnchor="middle"
        fontSize={12}
        fontWeight={600}
        fill="var(--primary-foreground)"
      >
        {text}
      </text>
    </g>
  );
}

/**
 * The Tree view as it is now, all of it (EXP-04): every card, not just those on screen,
 * in the desktop card size, with the same start, folds, direction and ancestors mode.
 * *Expand all* draws the folded branches too.
 */
export function TreeScene({ options, title, subtitle, onReady }: SceneProps) {
  const settings = useTree((s) => s.tree!.settings);
  const treeOrientation = useUi((s) => s.orientation);
  const pedigreeSetting = useUi((s) => s.pedigreeId);
  const { selfId } = useSelfPerson();
  const { graph, focusId, descTree: shown } = useDescendantView('tree');
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const family = useSceneFonts(host);
  const svgRef = useRef<SVGSVGElement>(null);
  const date = useExportDate(options.date);

  const pedigreeId = pedigreeSetting && graph.persons.has(pedigreeSetting) ? pedigreeSetting : null;
  const descTree = useMemo(
    () => (options.expandAll && focusId ? buildDescendantTree(graph, focusId) : shown),
    [options.expandAll, focusId, graph, shown],
  );
  const layout = useMemo(() => {
    if (pedigreeId) {
      const root = buildAncestorTree(graph, pedigreeId);
      return root ? layoutPedigree(root, COMFORTABLE) : null;
    }
    return descTree ? layoutTree(descTree, COMFORTABLE, treeOrientation) : null;
  }, [pedigreeId, graph, descTree, treeOrientation]);
  const branches = useMemo(
    () => (descTree && !pedigreeId ? branchOf(descTree) : new Map<string, number | null>()),
    [descTree, pedigreeId],
  );
  const generations = layout?.cards.reduce((most, card) => Math.max(most, card.depth + 1), 1) ?? 1;
  const heads = pedigreeId ? [] : (descTree?.children.map((child) => child.personId) ?? []);
  const { entries } = useLegendEntries(heads, generations);

  const bounds = layout?.bounds ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const content = useMemo(
    () => ({
      w: bounds.maxX - bounds.minX + 2 * MARGIN,
      h: bounds.maxY - bounds.minY + 2 * MARGIN,
    }),
    [bounds.maxX, bounds.minX, bounds.maxY, bounds.minY],
  );

  useWhenPainted(
    Boolean(family && layout),
    () => {
      const svg = svgRef.current;
      if (!svg) return null;
      return {
        kind: 'svg',
        svg,
        size: { w: svg.width.baseVal.value, h: svg.height.baseVal.value },
        namePx: COMFORTABLE_NAME_PX,
      };
    },
    onReady,
  );

  return (
    <div ref={setHost} className="font-sans">
      {family && layout && (
        <SceneFrame
          svgRef={svgRef}
          family={family}
          content={content}
          origin={{ x: bounds.minX - MARGIN, y: bounds.minY - MARGIN }}
          title={title}
          subtitle={subtitle}
          legend={options.legend ? entries : []}
          date={date}
        >
          <defs>
            <AvatarClip />
          </defs>
          <Connectors lines={layout.lines} />
          {layout.cards.map((card) => {
            const person = graph.persons.get(card.personId);
            if (!person) return null;
            return (
              <SceneCard
                key={card.key}
                card={card}
                person={person}
                accent={accentColor(settings.colorBy, {
                  branch: branches.get(card.nodeKey) ?? null,
                  generation: card.depth,
                  gender: person.gender,
                })}
                isSelf={card.personId === selfId}
                photos={options.photos}
                family={family}
              />
            );
          })}
          {!options.expandAll &&
            layout.cards.map((card) => <HiddenCount key={`h:${card.key}`} card={card} />)}
        </SceneFrame>
      )}
    </div>
  );
}
