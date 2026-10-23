'use client';

import { MailIcon, PencilIcon, PhoneIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { formatPartialDate } from '@/lib/domain/dates';
import type { LifeEvent, Locale, Person } from '@/lib/domain/types';

import type { ReactNode } from 'react';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 py-2 sm:grid-cols-[8rem_1fr] sm:gap-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 leading-relaxed break-words whitespace-pre-line">{children}</dd>
    </div>
  );
}

/** "about 1931 · Shibganj": a date (with "about" when approximate) and a place. */
export function useLifeEventText(): (event: LifeEvent | undefined) => string {
  const t = useTranslations('person');
  const locale = useLocale() as Locale;
  return (event) => {
    if (!event) return '';
    const date = event.date ? formatPartialDate(event.date, locale) : '';
    const shown = event.date?.approximate ? t('approxDate', { date }) : date;
    return [shown, event.place].filter(Boolean).join(' · ');
  };
}

/** `tel:` keeps only + and digits. */
const telHref = (phone: string) => `tel:${phone.replace(/[^+0-9]/g, '')}`;

/**
 * A person's details as text (P5-02, PER-04 view state): life events, work, contact
 * details as links, addresses, extra fields and the description. Anything not recorded
 * is left out; with nothing at all, it offers to add details.
 */
export function PersonSummary({ person, onEdit }: { person: Person; onEdit: () => void }) {
  const t = useTranslations('person');
  const lifeEvent = useLifeEventText();
  const rows: { key: string; label: string; value: ReactNode }[] = [];
  const add = (key: string, label: string, value: ReactNode) => {
    if (value) rows.push({ key, label, value });
  };

  add('nickname', t('nickname'), person.nickname);
  add('born', t('born'), lifeEvent(person.birth));
  if (!person.isLiving) add('died', t('died'), lifeEvent(person.death));
  add('profession', t('profession'), person.profession);
  add('education', t('education'), person.education);
  if (person.phones?.length) {
    add(
      'phones',
      t('phones'),
      <ul className="space-y-1">
        {person.phones.map((phone) => (
          <li key={phone}>
            <a
              href={telHref(phone)}
              aria-label={t('call', { phone })}
              lang="en"
              className="inline-flex min-h-9 items-center gap-2 font-medium text-primary underline-offset-4 hover:underline"
            >
              <PhoneIcon className="size-4" aria-hidden />
              {phone}
            </a>
          </li>
        ))}
      </ul>,
    );
  }
  if (person.email) {
    add(
      'email',
      t('email'),
      <a
        href={`mailto:${person.email}`}
        lang="en"
        className="inline-flex min-h-9 items-center gap-2 font-medium break-all text-primary underline-offset-4 hover:underline"
      >
        <MailIcon className="size-4 shrink-0" aria-hidden />
        {person.email}
      </a>,
    );
  }
  add('present', t('presentAddress'), person.addresses?.present);
  add('permanent', t('permanentAddress'), person.addresses?.permanent);
  for (const field of person.customFields ?? []) add(field.id, field.label, field.value);

  if (rows.length === 0 && !person.description) {
    return (
      <div className="space-y-2 rounded-xl border border-dashed p-4 text-center">
        <p className="text-sm text-muted-foreground">{t('nothingMore')}</p>
        <Button variant="outline" className="h-11" onClick={onEdit}>
          <PencilIcon aria-hidden /> {t('addDetails')}
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {rows.length > 0 && (
        <dl className="divide-y">
          {rows.map((row) => (
            <Row key={row.key} label={row.label}>
              {row.value}
            </Row>
          ))}
        </dl>
      )}
      {person.description && (
        <section className="space-y-1">
          <h3 className="text-sm text-muted-foreground">{t('description')}</h3>
          <p className="leading-relaxed break-words whitespace-pre-line">{person.description}</p>
        </section>
      )}
    </div>
  );
}
