'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';

import { historyStore, useHistory } from '@/stores/historyStore';

import { useEditor } from './EditorProvider';

import type { Command } from './commands';

export interface UndoRedo {
  undo: () => void;
  redo: () => void;
  /** What the next undo or redo would change, or null when there's nothing to do. */
  undoLabel: string | null;
  redoLabel: string | null;
}

/** Undo and redo with the action's name (UX-01), saying what changed in a toast. */
export function useUndoRedo(): UndoRedo {
  const t = useTranslations();
  const editor = useEditor();
  const nextUndo = useHistory((s) => s.undoStack.at(-1)?.command ?? null);
  const nextRedo = useHistory((s) => s.redoStack.at(-1) ?? null);

  const label = useCallback(
    (command: Command) => {
      const key = `history.${command.labelKey}` as never;
      return t.has(key) ? t(key, command.labelValues as never) : t('history.other');
    },
    [t],
  );

  const undo = useCallback(() => {
    const command = historyStore.getState().undoStack.at(-1)?.command;
    if (!command) return;
    editor.undo();
    toast(t('editor.undone', { action: label(command) }), { id: 'history' });
  }, [editor, label, t]);

  const redo = useCallback(() => {
    const command = historyStore.getState().redoStack.at(-1);
    if (!command) return;
    editor.redo();
    toast(t('editor.redone', { action: label(command) }), { id: 'history' });
  }, [editor, label, t]);

  return useMemo(
    () => ({
      undo,
      redo,
      undoLabel: nextUndo ? label(nextUndo) : null,
      redoLabel: nextRedo ? label(nextRedo) : null,
    }),
    [undo, redo, nextUndo, nextRedo, label],
  );
}
