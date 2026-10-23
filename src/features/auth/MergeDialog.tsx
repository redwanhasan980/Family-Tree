'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { MergeAction } from '@/lib/domain/account';
import { scriptOf } from '@/lib/domain/names';
import type { ID } from '@/lib/domain/types';
import { logger } from '@/lib/logger';
import { ApiError } from '@/lib/repositories/api';
import { cn } from '@/lib/utils';

import { FormError } from './FormField';
import { clearPendingMerge, redeemPendingMerge, usePendingMerge } from './guestMerge';
import { useSession } from './SessionProvider';
import { useApiErrorText } from './useMessages';

const ACTIONS: readonly MergeAction[] = ['move', 'discard'];

/**
 * After signing in to an existing account as a guest with trees (AUTH-07): each guest tree
 * can be moved to the account (the default) or discarded. Comes back on the next visit
 * until it is answered or the ticket expires.
 */
export function MergeDialog() {
  const t = useTranslations();
  const apiErrorText = useApiErrorText();
  const { session } = useSession();
  const pending = usePendingMerge();
  const [choices, setChoices] = useState<Record<ID, MergeAction>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [postponed, setPostponed] = useState<string | null>(null);

  const account = session.status === 'registered' ? session.user.uid : null;
  // Signing up linked the guest itself: its trees are already the account's.
  const linkedItself = Boolean(account && pending && pending.guestUid === account);
  useEffect(() => {
    if (linkedItself) clearPendingMerge();
  }, [linkedItself]);

  if (!account || !pending || linkedItself || postponed === pending.ticketId) return null;

  const choiceFor = (id: ID): MergeAction => choices[id] ?? 'move';
  const anyDiscarded = pending.trees.some((tree) => choiceFor(tree.id) === 'discard');

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await redeemPendingMerge(
        pending,
        pending.trees.map((tree) => ({ treeId: tree.id, action: choiceFor(tree.id) })),
      );
      clearPendingMerge();
      if (result.moved.length > 0) toast.success(t('merge.moved', { count: result.moved.length }));
      else toast(t('merge.discarded'));
    } catch (failure) {
      logger.warn('auth.merge', { code: failure instanceof ApiError ? failure.code : 'unknown' });
      const code = failure instanceof ApiError ? failure.code : '';
      if (code === 'expired' || code === 'not_found' || code === 'conflict') {
        // The ticket can't be used again; don't ask any more.
        clearPendingMerge();
        toast.error(t(code === 'conflict' ? 'merge.conflict' : 'merge.expired'));
      } else {
        setError(apiErrorText(failure));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && setPostponed(pending.ticketId)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('merge.title')}</DialogTitle>
          <DialogDescription>{t('merge.body')}</DialogDescription>
        </DialogHeader>
        <ul className="space-y-3">
          {pending.trees.map((tree) => (
            <li key={tree.id} className="space-y-2 rounded-xl border p-3">
              <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span lang={scriptOf(tree.name)} className="font-semibold">
                  {tree.name}
                </span>
                <span className="text-sm text-muted-foreground">
                  {t('trees.people', { count: tree.personCount })}
                </span>
              </p>
              <fieldset className="grid grid-cols-2 gap-2" disabled={busy}>
                <legend className="sr-only">{tree.name}</legend>
                {ACTIONS.map((action) => (
                  <label
                    key={action}
                    className={cn(
                      'flex min-h-11 cursor-pointer items-center justify-center rounded-md border px-2 text-center text-sm font-medium transition-colors hover:bg-accent has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50',
                      action === 'move'
                        ? 'has-checked:border-primary has-checked:bg-primary has-checked:text-primary-foreground'
                        : 'has-checked:border-destructive has-checked:bg-destructive/10 has-checked:text-destructive',
                    )}
                  >
                    <input
                      type="radio"
                      name={`merge-${tree.id}`}
                      value={action}
                      checked={choiceFor(tree.id) === action}
                      onChange={() => setChoices((all) => ({ ...all, [tree.id]: action }))}
                      className="sr-only"
                    />
                    {t(`merge.${action}`)}
                  </label>
                ))}
              </fieldset>
            </li>
          ))}
        </ul>
        {anyDiscarded && <p className="text-sm text-destructive">{t('merge.discardWarning')}</p>}
        <FormError message={error} />
        <DialogFooter>
          <Button
            variant="outline"
            className="h-11"
            disabled={busy}
            onClick={() => setPostponed(pending.ticketId)}
          >
            {t('merge.later')}
          </Button>
          <Button className="h-11" disabled={busy} onClick={() => void confirm()}>
            {busy ? t('merge.working') : t('merge.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
