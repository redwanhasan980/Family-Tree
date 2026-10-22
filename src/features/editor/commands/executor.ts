import type { WriteOp } from '@/lib/domain/writes';
import type { HistoryState } from '@/stores/historyStore';

import type { Command } from './types';
import type { StoreApi } from 'zustand/vanilla';

export interface ExecutorDeps {
  /** Commits one atomic batch (repositories/writes.commitBatch). */
  commit: (ops: readonly WriteOp[]) => Promise<void>;
  history: StoreApi<HistoryState>;
  now?: () => number;
  /** The server refused a batch: Firestore has already rolled the screen back. */
  onError?: (error: unknown, command: Command) => void;
  /** R3: asks before undoing a change someone else has edited since. Resolve false to keep it. */
  confirmUndo?: (command: Command) => Promise<boolean>;
}

export interface Executor {
  /** Applies a command. The UI doesn't wait for the returned promise (DESIGN §11.3). */
  run: (command: Command) => Promise<void>;
  undo: () => Promise<boolean>;
  redo: () => Promise<boolean>;
}

/**
 * Runs commands and moves them between the undo and redo stacks. Writes are not awaited
 * before updating history: Firestore shows them at once and syncs later, even offline.
 */
export function createExecutor({
  commit,
  history,
  now = Date.now,
  onError,
  confirmUndo,
}: ExecutorDeps): Executor {
  const send = (ops: readonly WriteOp[], command: Command): Promise<void> =>
    commit(ops).catch((error: unknown) => {
      history.getState().discard(command.id);
      onError?.(error, command);
    });

  return {
    run(command) {
      history.getState().record(command, now());
      return send(command.forward, command);
    },
    async undo() {
      const command = history.getState().takeUndo();
      if (!command) return false;
      if (confirmUndo && !(await confirmUndo(command))) {
        history.getState().pushUndo(command, 0);
        return false;
      }
      history.getState().pushRedo(command);
      void send(command.inverse, command);
      return true;
    },
    async redo() {
      const command = history.getState().takeRedo();
      if (!command) return false;
      history.getState().pushUndo(command, 0);
      void send(command.forward, command);
      return true;
    },
  };
}
