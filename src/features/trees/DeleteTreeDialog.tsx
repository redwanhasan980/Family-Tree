'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
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
import { FormError, FormField } from '@/features/auth/FormField';
import { useApiErrorText } from '@/features/auth/useMessages';
import { scriptOf } from '@/lib/domain/names';
import { matchesTreeName, needsNameToDelete } from '@/lib/domain/treeForms';
import type { Tree } from '@/lib/domain/types';

import { deleteTree } from './treeActions';

/** Deletes a tree for good. Trees with more than ten people need their name typed (TREE-03). */
export function DeleteTreeDialog({
  tree,
  open,
  onOpenChange,
}: {
  tree: Tree;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const apiErrorText = useApiErrorText();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsName = needsNameToDelete(tree.personCount);
  const confirmed = !needsName || matchesTreeName(typed, tree.name);

  const close = (next: boolean) => {
    if (busy) return;
    if (!next) {
      setTyped('');
      setError(null);
    }
    onOpenChange(next);
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!confirmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      await deleteTree(tree.id);
      toast.success(t('deleteTree.done', { name: tree.name }));
      setBusy(false);
      close(false);
    } catch (failure) {
      setBusy(false);
      setError(apiErrorText(failure));
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t.rich('deleteTree.title', {
              name: tree.name,
              tree: (chunks) => <span lang={scriptOf(tree.name)}>{chunks}</span>,
            })}
          </DialogTitle>
          <DialogDescription>{t('deleteTree.body', { count: tree.personCount })}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void onSubmit(event)} noValidate className="space-y-5">
          {needsName && (
            <FormField
              label={t('deleteTree.confirmLabel')}
              placeholder={tree.name}
              autoComplete="off"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
            />
          )}
          <FormError message={error} />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="h-11"
              disabled={busy}
              onClick={() => close(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              variant="destructive"
              className="h-11"
              disabled={!confirmed || busy}
            >
              {busy ? t('deleteTree.deleting') : t('deleteTree.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
