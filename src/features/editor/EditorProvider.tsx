'use client';

import { useTranslations } from 'next-intl';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { toast } from 'sonner';

import type { ID } from '@/lib/domain/types';
import { logger } from '@/lib/logger';
import { commitBatch, newId } from '@/lib/repositories/writes';
import { historyStore } from '@/stores/historyStore';
import { selectGraph, treeStore } from '@/stores/treeStore';

import { createExecutor } from './commands/executor';
import { createTreeToucher } from './commands/touch';

import type { BuildResult, CommandContext } from './commands';

export interface Editor {
  /**
   * Builds a command against the open tree and runs it when it is valid (CLAUDE.md rule
   * 4). The result comes back so the UI can show problems. Writes are not awaited.
   */
  run: (build: (ctx: CommandContext) => BuildResult, options?: RunOptions) => BuildResult;
  undo: () => void;
  redo: () => void;
}

export interface RunOptions {
  /**
   * False holds back a valid command that has warnings (a possible duplicate, unlikely
   * dates), so the UI can ask first and run it again once the user confirms.
   */
  allowWarnings?: boolean;
}

const EditorContext = createContext<Editor | null>(null);

export function useEditor(): Editor {
  const editor = useContext(EditorContext);
  if (!editor) throw new Error('useEditor must be used inside <EditorProvider>');
  return editor;
}

const NOT_READY: BuildResult = { ok: false, issues: [{ severity: 'error', code: 'notReady' }] };

/** Commands, undo and redo for the open tree, as the signed-in user. */
export function EditorProvider({ actorId, children }: { actorId: ID; children: ReactNode }) {
  const t = useTranslations('editor');

  const editor = useMemo<Editor>(() => {
    const touch = createTreeToucher();
    const executor = createExecutor({
      commit: (ops) => {
        const { treeId } = treeStore.getState();
        return commitBatch(treeId ? touch(ops, { treeId, actorId }) : ops);
      },
      history: historyStore,
      // Firestore has already put the screen back; say so.
      onError: (error) => {
        logger.error('editor.write', error);
        toast.error(t('saveFailed'));
      },
    });
    return {
      run(build, { allowWarnings = true } = {}) {
        const state = treeStore.getState();
        if (!state.treeId || !state.tree) return NOT_READY;
        const result = build({
          treeId: state.treeId,
          tree: state.tree,
          graph: selectGraph(state),
          actorId,
          newId: () => newId(),
        });
        if (result.ok && (allowWarnings || result.warnings.length === 0)) {
          void executor.run(result.command);
        }
        return result;
      },
      undo: () => void executor.undo(),
      redo: () => void executor.redo(),
    };
  }, [actorId, t]);

  return <EditorContext.Provider value={editor}>{children}</EditorContext.Provider>;
}
