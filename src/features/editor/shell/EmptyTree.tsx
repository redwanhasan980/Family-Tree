'use client';

import { SproutIcon, UserRoundPlusIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { AddPersonDialog } from '@/features/person/AddPersonDialog';
import { uiStore } from '@/stores/uiStore';

/** A tree with nobody in it yet: one big button to add the first person (P3-03, ONB). */
export function EmptyTree() {
  const t = useTranslations('editor');
  const [adding, setAdding] = useState(false);
  return (
    <div className="flex min-h-full items-center justify-center px-4 py-10">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <span className="flex size-20 items-center justify-center rounded-full bg-highlight/20">
          <SproutIcon className="size-10" aria-hidden />
        </span>
        <h1 className="text-2xl font-semibold">{t('emptyTitle')}</h1>
        <p className="text-muted-foreground">{t('emptyBody')}</p>
        <Button size="lg" className="h-12 px-6 text-base" onClick={() => setAdding(true)}>
          <UserRoundPlusIcon aria-hidden /> {t('addFirst')}
        </Button>
      </div>
      <AddPersonDialog
        open={adding}
        onOpenChange={setAdding}
        title={t('addFirst')}
        description={t('emptyBody')}
        onAdded={(id) => uiStore.getState().select(id)}
      />
    </div>
  );
}
