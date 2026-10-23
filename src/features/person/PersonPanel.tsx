'use client';

import { FocusIcon, Trash2Icon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { usePersonText } from '@/features/editor/shell/usePersonText';
import { initials } from '@/lib/domain/names';
import type { Person } from '@/lib/domain/types';
import { uiStore } from '@/stores/uiStore';

import { RelativeActions } from './AddRelativeFlows';
import { DeletePersonDialog } from './DeletePersonDialog';
import { PersonDetailsForm } from './PersonDetailsForm';
import { PersonFamily } from './PersonFamily';

/**
 * Everything about one person (PER-04): who they are, quick ways to add relatives, their
 * details (saved as they're typed), their family with the relationship editors, showing
 * the tree from them, and deleting them. P5 adds the remaining fields and the photo.
 */
export function PersonPanel({ person }: { person: Person }) {
  const t = useTranslations('person');
  const { name, years } = usePersonText(person);
  const [deleting, setDeleting] = useState(false);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xl font-semibold text-primary"
        >
          {initials(name.text, name.lang)}
        </span>
        <div className="min-w-0">
          <h2 lang={name.lang} className="text-lg leading-snug font-semibold">
            {name.text}
          </h2>
          {name.secondary && (
            <p lang={name.secondary.lang} className="text-sm text-muted-foreground">
              {name.secondary.text}
            </p>
          )}
          {years && <p className="text-sm text-muted-foreground tabular-nums">{years}</p>}
        </div>
      </div>

      <RelativeActions personId={person.id} />
      <Separator />
      <section className="space-y-3" aria-label={t('details')}>
        <PersonDetailsForm key={person.id} person={person} />
      </section>
      <Separator />
      <section className="space-y-3" aria-label={t('family')}>
        <h3 className="font-semibold">{t('family')}</h3>
        <PersonFamily personId={person.id} />
      </section>
      <Separator />
      <div className="flex flex-col gap-2">
        <Button
          variant="outline"
          className="h-11 justify-start"
          onClick={() => {
            uiStore.getState().focus(person.id);
            uiStore.getState().setView('tree');
            uiStore.getState().setDetailsOpen(false);
          }}
        >
          <FocusIcon aria-hidden /> {t('show')}
        </Button>
        <Button
          variant="ghost"
          className="h-11 justify-start text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => setDeleting(true)}
        >
          <Trash2Icon aria-hidden /> {t('delete')}
        </Button>
      </div>
      {deleting && <DeletePersonDialog personId={person.id} onClose={() => setDeleting(false)} />}
    </div>
  );
}
