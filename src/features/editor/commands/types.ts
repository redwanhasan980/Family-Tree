import type { FamilyGraph } from '@/lib/domain/graph';
import type { ID, Issue, Tree } from '@/lib/domain/types';
import type { WriteOp } from '@/lib/domain/writes';

/**
 * Every data change is a Command (CLAUDE.md rule 4, DESIGN §11.3): forward writes, the
 * writes that undo them, and a label for the history. Builders are pure: they read the
 * current graph and never touch Firebase.
 */
export interface Command {
  id: string;
  /** i18n key in the `history` namespace, e.g. "addChildren". */
  labelKey: string;
  labelValues?: Record<string, string | number>;
  forward: WriteOp[];
  inverse: WriteOp[];
  /** Documents this command changes, for the R3 "changed by someone else" check before undo. */
  touched: string[];
  /** Commands with the same key within 2 seconds merge into one undo step (field edits). */
  coalesceKey?: string;
  /** People this command created, so the UI can select them. */
  createdIds?: ID[];
}

/** What a command needs to know. */
export interface CommandContext {
  treeId: ID;
  tree: Tree;
  graph: FamilyGraph;
  /** The signed-in user. */
  actorId: ID;
  /** Makes new document IDs (Firestore auto IDs on the device). */
  newId: () => ID;
}

/**
 * `ok: false` means an error blocks the change. Warnings (unlikely dates, a possible
 * duplicate) come with a command: the UI asks the user before running it.
 */
export type BuildResult =
  { ok: true; command: Command; warnings: Issue[] } | { ok: false; issues: Issue[] };
