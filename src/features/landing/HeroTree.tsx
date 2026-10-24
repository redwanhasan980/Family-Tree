import { getTranslations } from 'next-intl/server';

import { initials } from '@/lib/domain/names';
import type { Locale } from '@/lib/domain/types';

const W = 160;
const H = 56;

type Key =
  | 'grandfather'
  | 'grandmother'
  | 'daughter'
  | 'son'
  | 'daughterInLaw'
  | 'grandson'
  | 'granddaughter';

/** Where each card sits, and its branch colour (DESIGN §21.3), in order of appearance. */
const CARDS: { key: Key; x: number; y: number; accent: string }[] = [
  { key: 'grandfather', x: 100, y: 20, accent: 'var(--data-neutral)' },
  { key: 'grandmother', x: 300, y: 20, accent: 'var(--data-neutral)' },
  { key: 'daughter', x: 15, y: 140, accent: 'var(--branch-1)' },
  { key: 'son', x: 200, y: 140, accent: 'var(--branch-2)' },
  { key: 'daughterInLaw', x: 395, y: 140, accent: 'var(--branch-2)' },
  { key: 'grandson', x: 215, y: 260, accent: 'var(--branch-2)' },
  { key: 'granddaughter', x: 395, y: 260, accent: 'var(--branch-2)' },
];

/** The connectors, drawn after the cards they join. */
const LINES = [
  'M260 48 H300',
  'M280 48 V110 H95 V140 M280 110 V140',
  'M360 168 H395',
  'M377.5 168 V230 H295 V260 M377.5 230 H475 V260',
];

/**
 * The landing page's sample family (ONB-01): grandparents, two children, a wife and two
 * grandchildren, appearing one after another. Plain SVG drawn on the server, so it costs
 * no JavaScript; reduced motion shows it at once (globals.css).
 */
export async function HeroTree({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'landing' });
  return (
    <svg
      viewBox="0 0 560 340"
      role="img"
      aria-label={t('sampleLabel')}
      className="landing-tree h-auto w-full max-w-xl font-sans"
    >
      <g fill="none" stroke="var(--connector)" strokeWidth={1.5}>
        {LINES.map((d, i) => (
          <path
            key={d}
            d={d}
            pathLength={1}
            className="landing-draw"
            style={{ animationDelay: `${300 + i * 350}ms` }}
          />
        ))}
      </g>
      <circle cx={280} cy={48} r={4} fill="var(--background)" stroke="var(--connector)" />
      <circle cx={377.5} cy={168} r={4} fill="var(--background)" stroke="var(--connector)" />
      {CARDS.map(({ key, x, y, accent }, i) => {
        const name = t(`sample.${key}`);
        return (
          <g
            key={key}
            className="landing-pop"
            style={{
              animationDelay: `${i * 220}ms`,
              transformOrigin: `${x + W / 2}px ${y + H / 2}px`,
            }}
          >
            <rect
              x={x}
              y={y}
              width={W}
              height={H}
              rx={12}
              fill="var(--card)"
              stroke="var(--border)"
            />
            <rect x={x + 5} y={y + 12} width={4} height={H - 24} rx={2} fill={accent} />
            <circle
              cx={x + 34}
              cy={y + H / 2}
              r={18}
              fill="var(--muted)"
              stroke={accent}
              strokeWidth={2}
            />
            <text
              x={x + 34}
              y={y + H / 2}
              dy="0.35em"
              textAnchor="middle"
              fontSize={12}
              fontWeight={600}
              fill="var(--foreground)"
            >
              {initials(name, locale)}
            </text>
            <text
              x={x + 60}
              y={y + H / 2}
              dy="0.35em"
              fontSize={13}
              fontWeight={600}
              fill="var(--foreground)"
            >
              {name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
