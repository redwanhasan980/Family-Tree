import {
  createTree,
  updateTreeDetails,
  type BuildResult,
  type CreateTreeInput,
} from '@/features/editor/commands';
import type { TreeDetailsInput } from '@/lib/domain/schemas';
import type { ID, Tree } from '@/lib/domain/types';
import { logger } from '@/lib/logger';
import { callApi } from '@/lib/repositories/api';
import { commitBatch, newId } from '@/lib/repositories/writes';

/**
 * Tree management from the dashboard (TREE-01, TREE-03). Creating and renaming are
 * commands committed without waiting, as in the editor: Firestore shows them at once and
 * syncs later. The dashboard has no undo history, so they aren't recorded.
 */

function send(result: BuildResult, onFailed: () => void): void {
  if (!result.ok) return;
  commitBatch(result.command.forward).catch((error: unknown) => {
    logger.error('trees.write', error);
    onFailed();
  });
}

/** Creates a tree (with its first person) and returns its ID straight away. */
export function startTree(
  actorId: ID,
  input: CreateTreeInput,
  onFailed: () => void,
): BuildResult & { treeId?: ID } {
  const result = createTree(input, { actorId, newId: () => newId() });
  send(result, onFailed);
  return result;
}

/** Renames a tree or changes its description. "No changes" is not a failure. */
export function saveTreeDetails(
  actorId: ID,
  tree: Tree,
  patch: TreeDetailsInput,
  onFailed: () => void,
): BuildResult {
  const result = updateTreeDetails({ treeId: tree.id, tree, actorId }, patch);
  send(result, onFailed);
  return result;
}

/** Deletes a tree with everything in it, on the server (owner only). Needs a connection. */
export async function deleteTree(treeId: ID): Promise<void> {
  await callApi(`/api/trees/${treeId}`, { method: 'DELETE' });
}
