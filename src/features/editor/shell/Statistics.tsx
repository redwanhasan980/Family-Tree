'use client';

import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { formatYear } from '@/lib/domain/dates';
import { treeStatistics } from '@/lib/domain/graph';
import type { Locale } from '@/lib/domain/types';
import { selectGraph, useTree } from '@/stores/treeStore';

/** People, generations, living and deceased, and the earliest birth year (TREE-08). */
export function StatisticsList() {
  const t = useTranslations('statistics');
  const format = useFormatter();
  const locale = useLocale() as Locale;
  const graph = useTree(selectGraph);
  const rootId = useTree((s) => s.tree?.rootPersonId);
  const stats = useMemo(() => treeStatistics(graph, rootId), [graph, rootId]);

  const rows: [string, string | null][] = [
    [t('people'), format.number(stats.people)],
    [t('generations'), format.number(stats.generations)],
    [t('living'), format.number(stats.living)],
    [t('deceased'), format.number(stats.deceased)],
    [
      t('earliest'),
      stats.earliestBirthYear === undefined ? null : formatYear(stats.earliestBirthYear, locale),
    ],
  ];
  return (
    <dl className="divide-y">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-4 py-2.5">
          <dt className="text-muted-foreground">{label}</dt>
          {value === null ? (
            <dd className="text-muted-foreground">{t('notRecorded')}</dd>
          ) : (
            <dd className="text-lg font-semibold tabular-nums">{value}</dd>
          )}
        </div>
      ))}
    </dl>
  );
}
