'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { toast } from 'sonner';

import { useEditor } from './EditorProvider';

/** A toast with an Undo button for destructive changes (UX-02). */
export function useUndoToast(): (message: string) => void {
  const t = useTranslations('person');
  const editor = useEditor();
  return useCallback(
    (message: string) =>
      toast(message, { action: { label: t('undo'), onClick: () => editor.undo() } }),
    [t, editor],
  );
}
