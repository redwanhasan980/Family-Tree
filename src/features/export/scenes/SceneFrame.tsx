'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { useMemo, type ReactNode, type Ref } from 'react';

import type { LegendEntry } from '@/features/views/shared/Legend';
import { measureText } from '@/features/views/shared/measureText';
import { APP_NAME } from '@/lib/brand';

import { FRAME, layoutFrame } from '../frame';

import type { Size } from '../geometry';

/** The date line under an export ("Exported on 24 October 2026"), or empty. */
export function useExportDate(show: boolean): string {
  const t = useTranslations('export');
  const format = useFormatter();
  return show ? t('exportedOn', { date: format.dateTime(new Date(), { dateStyle: 'long' }) }) : '';
}

/**
 * An exported drawing with its header and footer, all in one SVG (DESIGN §14): title,
 * subtitle, legend, the drawing, the date and "Made with শিকড়". The children draw with
 * `bounds`' top left at the content's corner.
 */
export function SceneFrame({
  svgRef,
  family,
  content,
  origin,
  title,
  subtitle,
  legend,
  date,
  children,
}: {
  svgRef: Ref<SVGSVGElement>;
  family: string;
  content: Size;
  /** The drawing's top left in its own coordinates. */
  origin: { x: number; y: number };
  title: string;
  subtitle: string;
  legend: readonly LegendEntry[];
  date: string;
  children: ReactNode;
}) {
  const t = useTranslations('export');
  const credit = t('madeWith', { app: APP_NAME });
  const frame = useMemo(
    () => layoutFrame(content, { title, subtitle, date, credit, legend }, measureText, family),
    [content, title, subtitle, date, credit, legend, family],
  );
  const L = FRAME.legend;
  return (
    <svg
      ref={svgRef}
      width={frame.w}
      height={frame.h}
      viewBox={`0 0 ${frame.w} ${frame.h}`}
      className="font-sans"
    >
      <rect width={frame.w} height={frame.h} fill="var(--surface)" />
      {frame.title && (
        <text
          x={frame.title.x}
          y={frame.title.y}
          fontSize={FRAME.title.size}
          fontWeight={600}
          fill="var(--foreground)"
        >
          {title}
        </text>
      )}
      {frame.subtitle && (
        <text
          x={frame.subtitle.x}
          y={frame.subtitle.y}
          fontSize={FRAME.subtitle.size}
          fill="var(--muted-foreground)"
        >
          {subtitle}
        </text>
      )}
      {frame.legend.map((place, i) => {
        const entry = legend[i]!;
        const Icon = entry.icon;
        const cy = place.y + L.line / 2;
        return (
          <g key={place.key}>
            <circle cx={place.x + L.swatch / 2} cy={cy} r={L.swatch / 2} fill={entry.color} />
            {Icon && (
              <Icon
                x={place.x + 2}
                y={cy - L.swatch / 2 + 2}
                width={L.swatch - 4}
                height={L.swatch - 4}
                color="var(--surface)"
              />
            )}
            <text
              x={place.x + L.swatch + L.gap}
              y={cy}
              dy="0.35em"
              fontSize={L.size}
              fill="var(--foreground)"
              lang={entry.lang}
            >
              {entry.label}
            </text>
          </g>
        );
      })}
      <g transform={`translate(${frame.content.x - origin.x}, ${frame.content.y - origin.y})`}>
        {children}
      </g>
      {date && (
        <text
          x={frame.footer.dateX}
          y={frame.footer.y}
          fontSize={FRAME.footer.size}
          fill="var(--muted-foreground)"
        >
          {date}
        </text>
      )}
      <text
        x={frame.footer.creditX}
        y={frame.footer.y}
        textAnchor="end"
        fontSize={FRAME.footer.size}
        fill="var(--muted-foreground)"
      >
        {credit}
      </text>
    </svg>
  );
}
