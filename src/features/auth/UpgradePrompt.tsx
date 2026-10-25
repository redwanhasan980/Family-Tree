'use client';

import { CloudUploadIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { UPGRADE_AT_VISIT } from '@/lib/domain/milestones';
import { cn } from '@/lib/utils';

import { useUpgradePrompt, useVisitCount, type UpgradePromptId } from './useUpgradePrompt';

/**
 * A gentle invitation for a guest to create an account (AUTH-03), with "Not now", which
 * hides it for 7 days. Not modal: whatever is under it stays usable.
 */
export function UpgradeCard({
  id,
  onDismiss,
  className,
}: {
  id: UpgradePromptId;
  onDismiss: () => void;
  className?: string;
}) {
  const t = useTranslations('upgrade');
  const guest = useTranslations('guest');
  return (
    <section
      aria-label={t('label')}
      className={cn(
        'flex gap-3 rounded-2xl border border-highlight/60 bg-popover p-4 text-popover-foreground shadow-lg',
        className,
      )}
    >
      <CloudUploadIcon aria-hidden className="mt-0.5 size-5 shrink-0 text-highlight" />
      <div className="min-w-0 flex-1 space-y-3">
        <p>{t(id)}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" className="h-9">
            <Link href="/signup">{guest('cta')}</Link>
          </Button>
          <Button size="sm" variant="ghost" className="h-9" onClick={onDismiss}>
            {t('later')}
          </Button>
        </div>
      </div>
    </section>
  );
}

/**
 * The invitation a guest sees in the editor or the dashboard: once their own changes
 * bring a tree to five people (`grown`), or from their 3rd visit. One at a time.
 */
export function GuestUpgradePrompt({
  grown = false,
  className,
}: {
  grown?: boolean;
  className?: string;
}) {
  const visits = useVisitCount();
  const growing = useUpgradePrompt('fifthPerson');
  const returning = useUpgradePrompt('thirdVisit');
  if (grown && growing.visible) {
    return <UpgradeCard id="fifthPerson" onDismiss={growing.dismiss} className={className} />;
  }
  if (visits >= UPGRADE_AT_VISIT && returning.visible) {
    return <UpgradeCard id="thirdVisit" onDismiss={returning.dismiss} className={className} />;
  }
  return null;
}
