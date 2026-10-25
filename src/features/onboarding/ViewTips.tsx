'use client';

import { LightbulbIcon, XIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useSyncExternalStore, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import type { ViewKind } from '@/lib/domain/types';
import { cn } from '@/lib/utils';
import { useUi } from '@/stores/uiStore';

import { markTipsSeen, tipsSeen } from './progress';

type TipKey =
  | 'tree.select'
  | 'tree.add'
  | 'tree.views'
  | 'tree.undo'
  | 'family.open'
  | 'circle.centre'
  | 'list.outline';

/** First-use tips per view (ONB-03); the Tree's are the wizard's short tour (ONB-02 ④). */
const TIPS: Partial<Record<ViewKind, readonly TipKey[]>> = {
  tree: ['tree.select', 'tree.add', 'tree.views', 'tree.undo'],
  family: ['family.open'],
  circle: ['circle.centre'],
  list: ['list.outline'],
};

const subscribeNothing = () => () => {};

/**
 * A small card of tips the first time someone opens a view in this browser, one at a
 * time, until "Got it" or close. It waits while a dialog or sheet is open, so the
 * wizard's "Add children" comes first. Not modal: the view stays usable under it.
 * `otherwise` shows in its place when there is no tip, so only one card shows at a time.
 */
export function ViewTips({
  tour,
  otherwise,
  className,
}: {
  tour: boolean;
  otherwise?: ReactNode;
  className?: string;
}) {
  const t = useTranslations('onboarding.tips');
  const view = useUi((s) => s.view);
  const busy = useUi((s) => s.addFlow !== null || s.searchOpen || s.deletingId !== null);
  // What was seen lives in this browser: read only once mounted, so the server's HTML
  // (no tips) matches the first render.
  const mounted = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
  const [seen, setSeen] = useState<readonly ViewKind[] | null>(null);
  const [steps, setSteps] = useState<Partial<Record<ViewKind, number>>>({});
  const [tourOver, setTourOver] = useState(false);
  const tips = TIPS[view] ?? [];
  const seenNow = seen ?? (mounted ? tipsSeen() : null);

  const wanted =
    seenNow !== null &&
    tips.length > 0 &&
    ((tour && view === 'tree' && !tourOver) || !seenNow.includes(view));
  if (busy) return null;
  if (!wanted) return otherwise ?? null;
  const index = Math.min(steps[view] ?? 0, tips.length - 1);
  const last = index === tips.length - 1;
  const close = () => {
    markTipsSeen(view);
    setSeen([...seenNow, view]);
    if (view === 'tree') setTourOver(true);
  };
  return (
    <section
      aria-label={t('label')}
      aria-live="polite"
      className={cn(
        'z-30 flex gap-3 rounded-2xl border bg-popover p-4 text-popover-foreground shadow-lg',
        className,
      )}
    >
      <LightbulbIcon aria-hidden className="mt-0.5 size-5 shrink-0 text-highlight" />
      <div className="min-w-0 flex-1 space-y-3">
        <p>{t(tips[index]!)}</p>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">
            {tips.length > 1 && t('count', { current: index + 1, total: tips.length })}
          </span>
          <Button
            size="sm"
            className="h-9"
            onClick={() => (last ? close() : setSteps({ ...steps, [view]: index + 1 }))}
          >
            {last ? t('done') : t('next')}
          </Button>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="-mt-1 -mr-1 size-9 shrink-0"
        aria-label={t('close')}
        onClick={close}
      >
        <XIcon aria-hidden />
      </Button>
    </section>
  );
}
