import {
  DEFAULT_TREE_SETTINGS,
  NewPersonSchema,
  TreeDetailsSchema,
  TreeSettingsSchema,
  type NewPersonInput,
  type TreeDetailsInput,
} from '@/lib/domain/schemas';
import type { ID, TreeSettings } from '@/lib/domain/types';
import { DELETE_FIELD, paths, SERVER_TIME, type WriteOp } from '@/lib/domain/writes';

import { commandId, createPerson, fail, failWith, ok, remove, touchTree, zodIssues } from './build';

import type { BuildResult, CommandContext } from './types';

const noChanges = (): BuildResult => ({
  ok: false,
  issues: [{ severity: 'warning', code: 'noChanges' }],
});

/** Tree-level commands also run from the dashboard, where no people are loaded. */
type TreeContext = Pick<CommandContext, 'treeId' | 'tree' | 'actorId'>;

export interface CreateTreeInput extends TreeDetailsInput {
  /** The first person, usually the oldest ancestor the user remembers (ONB). */
  root?: NewPersonInput;
}

/**
 * Creates a tree owned by the user, optionally with its first person, in one batch
 * (TREE-01). Runs outside any tree session, so it has its own small context.
 */
export function createTree(
  input: CreateTreeInput,
  { actorId, newId }: Pick<CommandContext, 'actorId' | 'newId'>,
): BuildResult & { treeId?: ID } {
  const details = TreeDetailsSchema.safeParse(input);
  if (!details.success) return failWith(zodIssues(details.error));
  const root = input.root ? NewPersonSchema.safeParse(input.root) : null;
  if (root && !root.success) return failWith(zodIssues(root.error));

  const treeId = newId();
  const rootId = root ? newId() : undefined;
  const ctx = { treeId, actorId };
  const forward: WriteOp[] = [
    {
      op: 'set',
      path: paths.tree(treeId),
      data: {
        name: details.data.name,
        ...(details.data.description && { description: details.data.description }),
        ownerId: actorId,
        memberIds: [actorId],
        roles: { [actorId]: 'owner' },
        ...(rootId && { rootPersonId: rootId }),
        personCount: rootId ? 1 : 0,
        settings: { ...DEFAULT_TREE_SETTINGS },
        createdAt: SERVER_TIME,
        updatedAt: SERVER_TIME,
        updatedBy: actorId,
        schemaVersion: 1,
      },
    },
    ...(root?.success && rootId ? [createPerson(ctx, rootId, root.data)] : []),
  ];
  const inverse: WriteOp[] = [
    ...(rootId ? [remove(paths.person(treeId, rootId))] : []),
    remove(paths.tree(treeId)),
  ];
  const result = ok({
    id: commandId(),
    labelKey: 'createTree',
    forward,
    inverse,
    touched: forward.map((op) => op.path),
    ...(rootId && { createdIds: [rootId] }),
  });
  return { ...result, treeId };
}

/** Which person the views start from (TREE-05). */
export function setRoot(ctx: CommandContext, personId: ID): BuildResult {
  if (!ctx.graph.persons.has(personId)) return fail('missingPerson');
  const previous = ctx.tree.rootPersonId;
  if (previous === personId)
    return { ok: false, issues: [{ severity: 'warning', code: 'noChanges' }] };
  return ok({
    id: commandId(),
    labelKey: 'setRoot',
    forward: [touchTree(ctx, 0, { rootPersonId: personId })],
    inverse: [touchTree(ctx, 0, { rootPersonId: previous ?? DELETE_FIELD })],
    touched: [paths.tree(ctx.treeId)],
  });
}

/** Renames a tree or changes its description (TREE-03). Owners and editors may. */
export function updateTreeDetails(ctx: TreeContext, patch: Partial<TreeDetailsInput>): BuildResult {
  const current = { name: ctx.tree.name, description: ctx.tree.description };
  const parsed = TreeDetailsSchema.safeParse({ ...current, ...patch });
  if (!parsed.success) return failWith(zodIssues(parsed.error));
  const next = parsed.data;
  const forward: Record<string, unknown> = {};
  const inverse: Record<string, unknown> = {};
  if (next.name !== current.name) {
    forward.name = next.name;
    inverse.name = current.name;
  }
  if (next.description !== current.description) {
    forward.description = next.description ?? DELETE_FIELD;
    inverse.description = current.description ?? DELETE_FIELD;
  }
  if (Object.keys(forward).length === 0) return noChanges();
  return ok({
    id: commandId(),
    labelKey: 'renameTree',
    forward: [touchTree(ctx, 0, forward)],
    inverse: [touchTree(ctx, 0, inverse)],
    touched: [paths.tree(ctx.treeId)],
  });
}

/** Changes how the tree is shown: names, colours, photos, dates, default view (TREE-06). */
export function updateTreeSettings(ctx: TreeContext, patch: Partial<TreeSettings>): BuildResult {
  const current = ctx.tree.settings;
  const parsed = TreeSettingsSchema.safeParse({ ...current, ...patch });
  if (!parsed.success) return failWith(zodIssues(parsed.error));
  const forward: Record<string, unknown> = {};
  const inverse: Record<string, unknown> = {};
  for (const key of Object.keys(parsed.data) as (keyof TreeSettings)[]) {
    if (parsed.data[key] !== current[key]) {
      forward[`settings.${key}`] = parsed.data[key];
      inverse[`settings.${key}`] = current[key];
    }
  }
  if (Object.keys(forward).length === 0) return noChanges();
  return ok({
    id: commandId(),
    labelKey: 'treeSettings',
    forward: [touchTree(ctx, 0, forward)],
    inverse: [touchTree(ctx, 0, inverse)],
    touched: [paths.tree(ctx.treeId)],
  });
}
