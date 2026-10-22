import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

import { canCoalesce, coalesce } from '@/features/editor/commands/coalesce';
import type { Command } from '@/features/editor/commands/types';

/** Undo keeps at least 50 steps (UX-01). */
export const HISTORY_LIMIT = 100;
/** Edits to the same person within this window are one undo step. */
export const COALESCE_MS = 2000;

export interface HistoryState {
  undoStack: { command: Command; at: number }[];
  redoStack: Command[];
  /** A new command: merges with the last one when it's a quick follow-up edit; clears redo. */
  record: (command: Command, at: number) => void;
  takeUndo: () => Command | undefined;
  takeRedo: () => Command | undefined;
  pushUndo: (command: Command, at: number) => void;
  pushRedo: (command: Command) => void;
  /** Drops a command whose writes the server refused. */
  discard: (commandId: string) => void;
  /** A different tree was opened. */
  clear: () => void;
}

export function createHistoryStore() {
  return createStore<HistoryState>()((set, get) => ({
    undoStack: [],
    redoStack: [],
    record: (command, at) =>
      set(({ undoStack }) => {
        const last = undoStack[undoStack.length - 1];
        if (last && at - last.at <= COALESCE_MS && canCoalesce(last.command, command)) {
          return {
            undoStack: [
              ...undoStack.slice(0, -1),
              { command: coalesce(last.command, command), at },
            ],
            redoStack: [],
          };
        }
        return { undoStack: [...undoStack, { command, at }].slice(-HISTORY_LIMIT), redoStack: [] };
      }),
    takeUndo: () => {
      const last = get().undoStack.at(-1);
      if (last) set(({ undoStack }) => ({ undoStack: undoStack.slice(0, -1) }));
      return last?.command;
    },
    takeRedo: () => {
      const last = get().redoStack.at(-1);
      if (last) set(({ redoStack }) => ({ redoStack: redoStack.slice(0, -1) }));
      return last;
    },
    // Redone commands get a timestamp of 0 so a following edit never merges into them.
    pushUndo: (command, at) =>
      set(({ undoStack }) => ({
        undoStack: [...undoStack, { command, at }].slice(-HISTORY_LIMIT),
      })),
    pushRedo: (command) => set(({ redoStack }) => ({ redoStack: [...redoStack, command] })),
    discard: (commandId) =>
      set(({ undoStack, redoStack }) => ({
        undoStack: undoStack.filter((e) => e.command.id !== commandId),
        redoStack: redoStack.filter((c) => c.id !== commandId),
      })),
    clear: () => set({ undoStack: [], redoStack: [] }),
  }));
}

/** The editor's history for the open tree. */
export const historyStore = createHistoryStore();

export function useHistory<T>(selector: (state: HistoryState) => T): T {
  return useStore(historyStore, selector);
}
