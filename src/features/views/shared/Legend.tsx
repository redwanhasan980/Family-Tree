'use client';

import { CircleHelpIcon, MarsIcon, PaletteIcon, VenusIcon, type LucideIcon } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { displayName } from '@/lib/domain/names';
import type { ID, Locale } from '@/lib/domain/types';
import { useTree } from '@/stores/treeStore';

import { BRANCH_SLOTS, branchColor, genderColor, generationColor, NEUTRAL } from './colors';

/** The ramp's distinct steps (DESIGN §21.3); later generations share the last one. */
const GENERATION_STEPS = 9;

interface Entry {
  key: string;
  color: string;
  label: string;
  lang?: Locale;
  icon?: LucideIcon;
}

function Swatch({ color, icon: Icon }: { color: string; icon?: LucideIcon }) {
  return (
    <span
      aria-hidden
      className="flex size-5 shrink-0 items-center justify-center rounded-full"
      style={{ backgroundColor: color }}
    >
      {Icon && <Icon className="size-3.5 text-white" />}
    </span>
  );
}

/**
 * What the data colours mean (VIS-06): the branches (the children of the person the view
 * starts from), the generations, or men and women, as the tree's setting says. Colour is
 * never the only cue: cards and arcs are always labelled, and gender also has an icon.
 */
export function LegendButton({
  heads,
  generations,
  className,
}: {
  /** The people who start each branch, in order. */
  heads: readonly ID[];
  /** How many generations the view shows, the first included. */
  generations: number;
  className?: string;
}) {
  const t = useTranslations();
  const format = useFormatter();
  const locale = useLocale() as Locale;
  const colorBy = useTree((s) => s.tree?.settings.colorBy ?? 'branch');
  const nameDisplay = useTree((s) => s.tree?.settings.nameDisplay ?? 'auto');
  const persons = useTree((s) => s.persons);

  let entries: Entry[] = [];
  switch (colorBy) {
    case 'branch':
      entries = heads.slice(0, BRANCH_SLOTS).flatMap((id, i) => {
        const person = persons.get(id);
        if (!person) return [];
        const name = displayName(person.names, nameDisplay, locale);
        return [
          {
            key: id,
            color: branchColor(i),
            label: t('listView.branchOf', { name: name.text }),
            lang: name.lang,
          },
        ];
      });
      if (heads.length > BRANCH_SLOTS) {
        entries.push({ key: 'other', color: NEUTRAL, label: t('legend.branchOther') });
      }
      break;
    case 'generation':
      entries = Array.from({ length: Math.min(generations, GENERATION_STEPS) }, (_, i) => ({
        key: String(i),
        color: generationColor(i),
        label:
          i === GENERATION_STEPS - 1 && generations > GENERATION_STEPS
            ? t('legend.generationsFrom', { number: format.number(i + 1) })
            : t('listView.generation', { number: format.number(i + 1) }),
      }));
      break;
    case 'gender':
      entries = [
        { key: 'male', color: genderColor('male'), label: t('person.male'), icon: MarsIcon },
        { key: 'female', color: genderColor('female'), label: t('person.female'), icon: VenusIcon },
        {
          key: 'unknown',
          color: genderColor('unknown'),
          label: t('legend.notGiven'),
          icon: CircleHelpIcon,
        },
      ];
      break;
    case 'none':
      return null;
    default:
      colorBy satisfies never;
  }
  if (entries.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className={className} aria-label={t('legend.button')}>
          <PaletteIcon aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="right" align="end" className="w-64">
        <PopoverTitle className="mb-2 text-sm font-semibold">
          {t('legend.title')}: {t(`treeSettings.colorByOptions.${colorBy}`)}
        </PopoverTitle>
        <ul className="space-y-1.5 text-sm">
          {entries.map((entry) => (
            <li key={entry.key} className="flex items-center gap-2">
              <Swatch color={entry.color} icon={entry.icon} />
              <span lang={entry.lang} className="min-w-0 truncate">
                {entry.label}
              </span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
