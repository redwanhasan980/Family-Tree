'use client';

import { useMemo, useRef, useState } from 'react';

import { useSelfPerson } from '@/features/person/useSelfPerson';
import { ArcFor, CentreDisc } from '@/features/views/circle/CircleView';
import { CIRCLE_COMFORTABLE, layoutCircle } from '@/features/views/circle/layout';
import { accentColor } from '@/features/views/shared/colors';
import { useLegendEntries } from '@/features/views/shared/Legend';
import { useDescendantView } from '@/features/views/shared/useDescendantView';
import { AvatarClip } from '@/features/views/tree/PersonCard';
import { useTree } from '@/stores/treeStore';
import { useUi } from '@/stores/uiStore';

import { useSceneFonts, useWhenPainted, type SceneProps } from './scene';
import { SceneFrame, useExportDate } from './SceneFrame';

/** Room outside the outer ring for the "more generations" ticks. */
const MARGIN = 12;
const NOOP = () => {};

/**
 * The Circle view as it is now (EXP-01/02): the same centre and number of rings, at the
 * desktop size, with the names that fit on their arcs.
 */
export function CircleScene({ options, title, subtitle, onReady }: SceneProps) {
  const colorBy = useTree((s) => s.tree!.settings.colorBy);
  const rings = useUi((s) => s.circleRings);
  const { selfId } = useSelfPerson();
  const { graph, focusId, descTree } = useDescendantView('circle', {
    maxDepth: rings,
    collapsible: false,
  });
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const family = useSceneFonts(host);
  const svgRef = useRef<SVGSVGElement>(null);
  const date = useExportDate(options.date);

  const layout = useMemo(
    () => (descTree ? layoutCircle(descTree, CIRCLE_COMFORTABLE) : null),
    [descTree],
  );
  const heads = descTree?.children.map((child) => child.personId) ?? [];
  const { entries } = useLegendEntries(heads, (layout?.rings ?? 0) + 1);
  const r = (layout?.radius ?? 0) + MARGIN;
  const content = useMemo(() => ({ w: 2 * r, h: 2 * r }), [r]);
  const centre = focusId ? graph.persons.get(focusId) : undefined;

  useWhenPainted(
    Boolean(family && layout),
    () => {
      const svg = svgRef.current;
      if (!svg || !layout) return null;
      return {
        kind: 'svg',
        svg,
        size: { w: svg.width.baseVal.value, h: svg.height.baseVal.value },
        namePx: layout.metrics.fontSize,
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
          origin={{ x: -r, y: -r }}
          title={title}
          subtitle={subtitle}
          legend={options.legend ? entries : []}
          date={date}
        >
          <defs>
            <AvatarClip />
          </defs>
          {layout.arcs.map((arc) => {
            const person = graph.persons.get(arc.personId);
            if (!person) return null;
            return (
              <ArcFor
                key={arc.key}
                arc={arc}
                geometry={arc}
                person={person}
                accent={accentColor(colorBy, {
                  branch: arc.branch,
                  generation: arc.depth,
                  gender: person.gender,
                })}
                selected={false}
                isSelf={arc.personId === selfId}
                tabbable={false}
                fontSize={layout.metrics.fontSize}
                fontFamily={family}
                fontsVersion={0}
                onActivate={NOOP}
                onCentre={NOOP}
                onHover={NOOP}
                onKeyDown={NOOP}
              />
            );
          })}
          {centre && (
            <CentreDisc
              person={centre}
              radius={layout.metrics.centre}
              fontFamily={family}
              selected={false}
              tabbable={false}
              onActivate={NOOP}
              onKeyDown={NOOP}
              photoVariant={options.photos ? 'export' : null}
            />
          )}
        </SceneFrame>
      )}
    </div>
  );
}
