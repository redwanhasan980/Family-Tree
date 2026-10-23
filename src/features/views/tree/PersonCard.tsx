'use client';

import { Link2Icon } from 'lucide-react';
import { memo, type KeyboardEvent } from 'react';

import { initials, type ShownName } from '@/lib/domain/names';

import { wrapText } from '../shared/measureText';

import type { LaidCard } from './layout';

/** Inner geometry of the two card sizes (DESIGN §13.2). */
const STYLE = {
  comfortable: { avatar: 48, avatarLeft: 16, gap: 10, right: 10, name: 14, line: 21, initials: 16 },
  compact: { avatar: 40, avatarLeft: 14, gap: 8, right: 8, name: 13, line: 19, initials: 14 },
} as const;

const YEARS_SIZE = 12;
const YEARS_LINE = 16;

export interface PersonCardProps {
  card: LaidCard;
  name: ShownName;
  years: string;
  deceased: boolean;
  accent: string | null;
  selected: boolean;
  compact: boolean;
  fontFamily: string;
  /** Changes when fonts finish loading, so names are measured again. */
  fontsVersion: number;
  label: string;
  linkLabel: string | null;
  tabbable: boolean;
  onActivate: (card: LaidCard) => void;
  onKeyDown?: (event: KeyboardEvent<SVGGElement>, card: LaidCard) => void;
}

/**
 * One person in the Tree view (VIS-05): an initials avatar ringed in the colour-by
 * accent, up to two lines of name and the life years. Pure SVG, so exports can
 * serialize it directly (ADR-013).
 */
export const PersonCard = memo(function PersonCard({
  card,
  name,
  years,
  deceased,
  accent,
  selected,
  compact,
  fontFamily,
  label,
  linkLabel,
  tabbable,
  onActivate,
  onKeyDown,
}: PersonCardProps) {
  const s = compact ? STYLE.compact : STYLE.comfortable;
  const textX = s.avatarLeft + s.avatar + s.gap;
  const textW = card.w - textX - s.right;
  const nameFont = `600 ${s.name}px ${fontFamily}`;
  const lines = wrapText(name.text, {
    maxWidth: textW,
    maxLines: 2,
    font: nameFont,
    locale: name.lang,
  });
  const blockH = lines.length * s.line + (years ? YEARS_LINE : 0);
  const top = (card.h - blockH) / 2;
  const avatarR = s.avatar / 2;

  return (
    <g
      className="tree-card"
      role="treeitem"
      aria-label={label}
      aria-selected={selected}
      aria-level={card.depth + 1}
      tabIndex={tabbable ? 0 : -1}
      data-person-id={card.personId}
      data-card-key={card.key}
      style={{ transform: `translate(${card.x}px, ${card.y}px)` }}
      onClick={() => onActivate(card)}
      onKeyDown={(event) => onKeyDown?.(event, card)}
    >
      <rect
        className="tree-card-frame"
        width={card.w}
        height={card.h}
        rx={12}
        fill={deceased ? 'var(--surface-muted)' : 'var(--card)'}
        stroke={selected ? 'var(--primary)' : 'var(--border)'}
        strokeWidth={selected ? 2.5 : 1}
        strokeDasharray={card.isRef ? '5 4' : undefined}
      />
      {accent && (
        <rect x={5} y={12} width={4} height={card.h - 24} rx={2} fill={accent} aria-hidden />
      )}
      <circle
        cx={s.avatarLeft + avatarR}
        cy={card.h / 2}
        r={avatarR}
        fill="var(--muted)"
        stroke={accent ?? 'var(--border)'}
        strokeWidth={accent ? 2 : 1}
      />
      <text
        x={s.avatarLeft + avatarR}
        y={card.h / 2}
        dy="0.35em"
        textAnchor="middle"
        lang={name.lang}
        fontSize={s.initials}
        fontWeight={600}
        fill="var(--foreground)"
        aria-hidden
      >
        {initials(name.text, name.lang)}
      </text>
      <text
        lang={name.lang}
        fontSize={s.name}
        fontWeight={600}
        fill="var(--foreground)"
        aria-hidden
      >
        {lines.map((line, i) => (
          <tspan key={i} x={textX} y={top + i * s.line + s.name + 2}>
            {line}
          </tspan>
        ))}
      </text>
      {years && (
        <text
          x={textX}
          y={top + lines.length * s.line + YEARS_SIZE + 1}
          fontSize={YEARS_SIZE}
          fill="var(--muted-foreground)"
          aria-hidden
        >
          {years}
        </text>
      )}
      {linkLabel && (
        <g transform={`translate(${card.w - 22}, 6)`} aria-hidden>
          <title>{linkLabel}</title>
          <Link2Icon width={16} height={16} color="var(--muted-foreground)" />
        </g>
      )}
    </g>
  );
});
