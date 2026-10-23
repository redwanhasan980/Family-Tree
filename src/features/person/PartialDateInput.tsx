'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useId, useMemo } from 'react';

import { Input } from '@/components/ui/input';
import { INTL_LOCALE } from '@/lib/domain/dates';
import type { DateDraft } from '@/lib/domain/personForms';
import type { Locale } from '@/lib/domain/types';

/**
 * Day, month and year, any of them left empty (partial dates, SRS §6.2). Digits may be
 * typed in Bangla or English.
 */
export function PartialDateInput({
  legend,
  value,
  error,
  onChange,
  onBlur,
}: {
  legend: string;
  value: DateDraft;
  error?: string;
  onChange: (value: DateDraft) => void;
  onBlur?: () => void;
}) {
  const t = useTranslations('person');
  const locale = useLocale() as Locale;
  const id = useId();
  const months = useMemo(() => {
    const format = new Intl.DateTimeFormat(INTL_LOCALE[locale], { month: 'long', timeZone: 'UTC' });
    return Array.from({ length: 12 }, (_, i) => format.format(new Date(Date.UTC(2000, i, 1))));
  }, [locale]);
  const set = (patch: Partial<DateDraft>) => onChange({ ...value, ...patch });

  return (
    <fieldset className="space-y-1.5" aria-describedby={error ? `${id}-error` : undefined}>
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="grid grid-cols-[4.5rem_1fr_5.5rem] gap-2 pt-1">
        <Input
          aria-label={t('day')}
          placeholder={t('day')}
          inputMode="numeric"
          maxLength={2}
          value={value.day}
          onChange={(event) => set({ day: event.target.value })}
          onBlur={onBlur}
          aria-invalid={error ? true : undefined}
          className="h-11 text-base"
        />
        <select
          aria-label={t('month')}
          value={value.month}
          onChange={(event) => set({ month: event.target.value })}
          onBlur={onBlur}
          className="h-11 rounded-md border border-input bg-transparent px-2 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <option value="">{t('noMonth')}</option>
          {months.map((name, i) => (
            <option key={name} value={String(i + 1)}>
              {name}
            </option>
          ))}
        </select>
        <Input
          aria-label={t('year')}
          placeholder={t('year')}
          inputMode="numeric"
          maxLength={4}
          value={value.year}
          onChange={(event) => set({ year: event.target.value })}
          onBlur={onBlur}
          aria-invalid={error ? true : undefined}
          className="h-11 text-base"
        />
      </div>
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}
