import {
  childLinksOf,
  hasErrors,
  isAncestor,
  parentLinksOf,
  spouseLinksOf,
  validateParentLink,
  validateSpouseLink,
} from '@/lib/domain/graph';
import { parentLinkId } from '@/lib/domain/ids';
import { PartialDateSchema } from '@/lib/domain/schemas';
import type {
  ID,
  ParentKind,
  ParentLink,
  PartialDate,
  SpouseLink,
  SpouseStatus,
} from '@/lib/domain/types';
import { DELETE_FIELD, type WriteData, type WriteOp } from '@/lib/domain/writes';

import {
  commandId,
  createLink,
  fail,
  failWith,
  linkPath,
  ok,
  personPath,
  remove,
  restoreLink,
  touchedPaths,
  update,
  zodIssues,
} from './build';
import {
  nextMarriageSequence,
  parentLink,
  resolveOtherParent,
  spouseLink,
  warningsIn,
} from './personCommands';

import type { BuildResult, CommandContext } from './types';

const noChanges = (): BuildResult => ({
  ok: false,
  issues: [{ severity: 'warning', code: 'noChanges' }],
});

export type LinkSpec =
  | { type: 'parent'; parentId: ID; childId: ID; kind?: ParentKind }
  | { type: 'spouse'; personId: ID; partnerId: ID; status?: SpouseStatus };

/**
 * Links two people who are already in the tree (REL-06): for cousin marriages, adoption
 * and corrections.
 */
export function linkExisting(ctx: CommandContext, spec: LinkSpec): BuildResult {
  const g = ctx.graph;
  if (spec.type === 'parent') {
    const kind = spec.kind ?? 'biological';
    const issues = validateParentLink(g, { parentId: spec.parentId, childId: spec.childId, kind });
    if (hasErrors(issues)) return failWith(issues);
    const link = parentLink(spec.parentId, spec.childId, kind);
    const forward = [createLink(ctx, link)];
    return ok(
      {
        id: commandId(),
        labelKey: 'linkParent',
        forward,
        inverse: [remove(linkPath(ctx, link.id))],
        touched: touchedPaths(forward),
      },
      warningsIn(issues),
    );
  }
  const issues = validateSpouseLink(g, spec.personId, spec.partnerId);
  if (hasErrors(issues)) return failWith(issues);
  const link = spouseLink(
    spec.personId,
    spec.partnerId,
    spec.status ?? 'married',
    nextMarriageSequence(g, spec.personId),
  );
  const forward = [createLink(ctx, link)];
  return ok(
    {
      id: commandId(),
      labelKey: 'linkSpouse',
      forward,
      inverse: [remove(linkPath(ctx, link.id))],
      touched: touchedPaths(forward),
    },
    warningsIn(issues),
  );
}

/** Biological, adoptive, step or foster (REL-07). */
export function setParentKind(ctx: CommandContext, linkId: string, kind: ParentKind): BuildResult {
  const link = ctx.graph.links.get(linkId);
  if (!link || link.type !== 'parent') return fail('missingRelationship');
  if (link.kind === kind) return noChanges();
  const issues =
    kind === 'biological'
      ? validateParentLink(ctx.graph, {
          parentId: link.parentId,
          childId: link.childId,
          kind,
          replacing: link.parentId,
        })
      : [];
  if (hasErrors(issues)) return failWith(issues);
  const path = linkPath(ctx, linkId);
  return ok(
    {
      id: commandId(),
      labelKey: 'setParentKind',
      forward: [update(ctx, path, { kind })],
      inverse: [update(ctx, path, { kind: link.kind })],
      touched: [path],
    },
    warningsIn(issues),
  );
}

export interface SpouseDetailsPatch {
  status?: SpouseStatus;
  /** null removes the date. */
  marriageDate?: PartialDate | null;
  /** null removes the number. */
  sequence?: number | null;
}

/** Married, divorced, separated or widowed; marriage date and order (REL-01, REL-07). */
export function setSpouseStatus(
  ctx: CommandContext,
  linkId: string,
  patch: SpouseDetailsPatch,
): BuildResult {
  const link = ctx.graph.links.get(linkId);
  if (!link || link.type !== 'spouse') return fail('missingRelationship');
  if (patch.marriageDate) {
    const parsed = PartialDateSchema.safeParse(patch.marriageDate);
    if (!parsed.success) return failWith(zodIssues(parsed.error));
  }
  if (
    patch.sequence != null &&
    (!Number.isInteger(patch.sequence) || patch.sequence < 1 || patch.sequence > 50)
  ) {
    return fail('invalid', { field: 'sequence' });
  }
  const forwardData: WriteData = {};
  const inverseData: WriteData = {};
  const set = (key: 'status' | 'marriageDate' | 'sequence', next: unknown, current: unknown) => {
    if (next === undefined || JSON.stringify(next ?? undefined) === JSON.stringify(current)) return;
    forwardData[key] = next ?? DELETE_FIELD;
    inverseData[key] = current ?? DELETE_FIELD;
  };
  set('status', patch.status, link.status);
  set('marriageDate', patch.marriageDate, link.marriageDate);
  set('sequence', patch.sequence, link.sequence);
  if (Object.keys(forwardData).length === 0) return noChanges();
  const path = linkPath(ctx, linkId);
  return ok({
    id: commandId(),
    labelKey: 'setSpouseStatus',
    forward: [update(ctx, path, forwardData)],
    inverse: [update(ctx, path, inverseData)],
    touched: [path],
  });
}

/**
 * Changes one of a child's parents, for example which wife is the mother (REL-07).
 * `from` null adds a parent; `to` null removes one. The link keeps its kind.
 */
export function changeOtherParent(
  ctx: CommandContext,
  childId: ID,
  from: ID | null,
  to: ID | null,
): BuildResult {
  const g = ctx.graph;
  if (!g.persons.has(childId)) return fail('missingPerson');
  if (from === to) return noChanges();
  const old = from ? parentLinksOf(g, childId).find((l) => l.parentId === from) : undefined;
  if (from && !old) return fail('missingRelationship');
  const kind = old?.kind ?? 'biological';
  const issues = to
    ? validateParentLink(g, { parentId: to, childId, kind, ...(from && { replacing: from }) })
    : [];
  if (hasErrors(issues)) return failWith(issues);

  const added = to ? parentLink(to, childId, kind) : null;
  const forward: WriteOp[] = [
    ...(old ? [remove(linkPath(ctx, old.id))] : []),
    ...(added ? [createLink(ctx, added)] : []),
  ];
  const inverse: WriteOp[] = [
    ...(added ? [remove(linkPath(ctx, added.id))] : []),
    ...(old ? [restoreLink(ctx, old)] : []),
  ];
  return ok(
    {
      id: commandId(),
      labelKey: 'changeOtherParent',
      forward,
      inverse,
      touched: touchedPaths(forward),
    },
    warningsIn(issues),
  );
}

export interface MoveBranchOptions {
  /** The other parent under the new parent: undefined = automatic (REL-03), null = nobody. */
  otherParentId?: ID | null;
}

/**
 * Moves a person, with everyone below them, under a different parent (REL-08). Their
 * current parent links are replaced; their descendants follow automatically.
 */
export function moveBranch(
  ctx: CommandContext,
  childId: ID,
  toParentId: ID,
  { otherParentId }: MoveBranchOptions = {},
): BuildResult {
  const g = ctx.graph;
  if (!g.persons.has(childId) || !g.persons.has(toParentId)) return fail('missingPerson');
  if (childId === toParentId) return fail('selfRelationship');
  if (isAncestor(g, childId, toParentId)) return fail('cycle');
  const other = resolveOtherParent(g, toParentId, otherParentId);
  if (!other.ok) return fail('notAPartner');
  const targets = [toParentId, ...(other.id ? [other.id] : [])];
  if (targets.some((p) => spouseLinksOf(g, p).some((l) => l.personIds.includes(childId)))) {
    return fail('spouseParentConflict');
  }
  if (other.id === childId || (other.id && isAncestor(g, childId, other.id))) return fail('cycle');

  const current = parentLinksOf(g, childId);
  const wanted = targets.map((p) => parentLinkId(p, childId));
  const removed = current.filter((l) => !wanted.includes(l.id));
  const added = targets
    .filter((p) => !current.some((l) => l.parentId === p))
    .map((p) => parentLink(p, childId, 'biological'));
  if (removed.length === 0 && added.length === 0) return noChanges();

  const forward = [
    ...removed.map((l) => remove(linkPath(ctx, l.id))),
    ...added.map((l) => createLink(ctx, l)),
  ];
  const inverse = [
    ...added.map((l) => remove(linkPath(ctx, l.id))),
    ...removed.map((l: ParentLink) => restoreLink(ctx, l)),
  ];
  return ok({
    id: commandId(),
    labelKey: 'moveBranch',
    forward,
    inverse,
    touched: touchedPaths(forward),
  });
}

/**
 * Puts some of a parent's children in a new order (REL-07). `orderedIds` may be one
 * family's children; they take the same positions in the full list, in the new order.
 * Every child of the parent then gets an explicit order, so both parents agree.
 */
export function reorderChildren(
  ctx: CommandContext,
  parentId: ID,
  orderedIds: readonly ID[],
): BuildResult {
  const g = ctx.graph;
  if (!g.persons.has(parentId)) return fail('missingPerson');
  const all = childLinksOf(g, parentId).map((l) => l.childId);
  const unique = new Set(orderedIds);
  if (unique.size !== orderedIds.length || orderedIds.some((id) => !all.includes(id)))
    return fail('invalidOrder');

  const slots = all.map((id, index) => (unique.has(id) ? index : -1)).filter((index) => index >= 0);
  const order = [...all];
  slots.forEach((slot, i) => (order[slot] = orderedIds[i]!));

  const forward: WriteOp[] = [];
  const inverse: WriteOp[] = [];
  order.forEach((id, index) => {
    const current = g.persons.get(id)!.childOrder;
    if (current === index) return;
    const path = personPath(ctx, id);
    forward.push(update(ctx, path, { childOrder: index }));
    inverse.push(update(ctx, path, { childOrder: current ?? DELETE_FIELD }));
  });
  if (forward.length === 0 || (order.every((id, i) => id === all[i]) && forward.length === 0))
    return noChanges();
  return ok({
    id: commandId(),
    labelKey: 'reorderChildren',
    forward,
    inverse,
    touched: touchedPaths(forward),
  });
}

/**
 * Puts someone's marriages in a new order (REL-07): 1st, 2nd … by `sequence`, which comes
 * before the marriage dates in the family order (§12.2). One undo step.
 */
export function reorderSpouses(
  ctx: CommandContext,
  personId: ID,
  orderedLinkIds: readonly string[],
): BuildResult {
  const g = ctx.graph;
  if (!g.persons.has(personId)) return fail('missingPerson');
  const all: readonly string[] = spouseLinksOf(g, personId).map((l) => l.id);
  if (
    new Set(orderedLinkIds).size !== orderedLinkIds.length ||
    orderedLinkIds.length !== all.length ||
    orderedLinkIds.some((id) => !all.includes(id))
  ) {
    return fail('invalidOrder');
  }
  const forward: WriteOp[] = [];
  const inverse: WriteOp[] = [];
  orderedLinkIds.forEach((linkId, index) => {
    const link = g.links.get(linkId) as SpouseLink;
    if (link.sequence === index + 1) return;
    const path = linkPath(ctx, linkId);
    forward.push(update(ctx, path, { sequence: index + 1 }));
    inverse.push(update(ctx, path, { sequence: link.sequence ?? DELETE_FIELD }));
  });
  if (forward.length === 0) return noChanges();
  return ok({
    id: commandId(),
    labelKey: 'reorderSpouses',
    forward,
    inverse,
    touched: touchedPaths(forward),
  });
}

/** Removes a relationship but keeps both people (REL-09). */
export function removeRelationship(ctx: CommandContext, linkId: string): BuildResult {
  const link = ctx.graph.links.get(linkId);
  if (!link) return fail('missingRelationship');
  const forward = [remove(linkPath(ctx, linkId))];
  return ok({
    id: commandId(),
    labelKey: 'removeRelationship',
    labelValues: { type: link.type },
    forward,
    inverse: [restoreLink(ctx, link)],
    touched: touchedPaths(forward),
  });
}
