'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FormError } from '@/features/auth/FormField';
import { deletePerson } from '@/features/editor/commands';
import { useEditor } from '@/features/editor/EditorProvider';
import { useIssueText } from '@/features/editor/useIssueText';
import { useUndoToast } from '@/features/editor/useUndoToast';
import { countDescendants } from '@/lib/domain/graph';
import { displayName } from '@/lib/domain/names';
import type { ID, Locale } from '@/lib/domain/types';
import { selectGraph, useTree } from '@/stores/treeStore';
import { uiStore, useUi } from '@/stores/uiStore';

/**
 * PER-06: delete a person with an Undo toast. Someone with descendants can go alone (the
 * children stay) or together with all of them.
 */
export function DeletePersonDialog({ personId, onClose }: { personId: ID; onClose: () => void }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const editor = useEditor();
  const issueText = useIssueText();
  const undoToast = useUndoToast();
  const graph = useTree(selectGraph);
  const nameDisplay = useTree((s) => s.tree?.settings.nameDisplay ?? 'auto');
  const [withDescendants, setWithDescendants] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const group = useId();
  const person = graph.persons.get(personId);
  if (!person) return null;
  const name = displayName(person.names, nameDisplay, locale);
  const descendants = countDescendants(graph, personId);

  const confirm = () => {
    const result = editor.run((ctx) => deletePerson(ctx, personId, { withDescendants }));
    if (!result.ok) {
      setError(issueText(result.issues[0]!));
      return;
    }
    uiStore.getState().select(null);
    onClose();
    undoToast(t('person.deleted', { name: name.text }));
  };

  const option = (value: boolean, label: string) => (
    <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm has-checked:border-primary has-checked:bg-primary/10 has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50">
      <input
        type="radio"
        name={group}
        checked={withDescendants === value}
        onChange={() => setWithDescendants(value)}
        className="size-4 accent-primary"
      />
      {label}
    </label>
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('person.deleteTitle')}</DialogTitle>
          <DialogDescription>
            <span lang={name.lang} className="font-medium text-foreground">
              {name.text}
            </span>
            {' · '}
            {t('person.deleteBody')}
          </DialogDescription>
        </DialogHeader>
        {descendants > 0 && (
          <fieldset className="space-y-2">
            {option(false, t('person.deleteOnly'))}
            {option(true, t('person.deleteWithDescendants', { count: descendants }))}
          </fieldset>
        )}
        <FormError message={error} />
        <DialogFooter>
          <Button variant="outline" className="h-11" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="destructive" className="h-11" onClick={confirm}>
            {t('person.delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The delete confirmation for whoever `uiStore.deletingId` names (the panel or the Del key). */
export function DeletePersonFlow() {
  const deletingId = useUi((s) => s.deletingId);
  const exists = useTree((s) => (deletingId ? s.persons.has(deletingId) : false));
  if (!deletingId || !exists) return null;
  return (
    <DeletePersonDialog
      key={deletingId}
      personId={deletingId}
      onClose={() => uiStore.getState().setDeleting(null)}
    />
  );
}
