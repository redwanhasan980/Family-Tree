import {
  newStamps,
  personDoc,
  relationshipFields,
  restoreStamps,
  updateStamps,
} from '@/lib/domain/documents';
import type { ID, Issue, Person, PersonDetails, Relationship } from '@/lib/domain/types';
import { increment, paths, type WriteData, type WriteOp } from '@/lib/domain/writes';

import type { BuildResult, Command, CommandContext } from './types';
import type { z } from 'zod';

/** Shared pieces for command builders. */

/** The parts of the context that writing documents needs. */
type WriteContext = Pick<CommandContext, 'treeId' | 'actorId'>;

export function fail(code: string, params?: Issue['params']): BuildResult {
  return { ok: false, issues: [{ severity: 'error', code, ...(params && { params }) }] };
}

export function failWith(issues: Issue[]): BuildResult {
  return { ok: false, issues };
}

export function ok(command: Command, warnings: Issue[] = []): BuildResult {
  return { ok: true, command, warnings };
}

/** Zod issues (whose messages are i18n keys) as validation issues. */
export function zodIssues(error: z.ZodError): Issue[] {
  return error.issues.map((issue) => ({
    severity: 'error',
    code: issue.message,
    params: { field: issue.path.join('.') },
  }));
}

export function personPath(ctx: WriteContext, personId: ID): string {
  return paths.person(ctx.treeId, personId);
}

export function linkPath(ctx: WriteContext, linkId: string): string {
  return paths.relationship(ctx.treeId, linkId);
}

/** Writes a brand-new person. */
export function createPerson(ctx: WriteContext, id: ID, details: PersonDetails): WriteOp {
  const person = { id, ...details } as Person;
  return { op: 'set', path: personPath(ctx, id), data: personDoc(person, newStamps(ctx.actorId)) };
}

/** Writes a brand-new relationship. */
export function createLink(ctx: WriteContext, link: Relationship): WriteOp {
  return {
    op: 'set',
    path: linkPath(ctx, link.id),
    data: { ...relationshipFields(link), ...newStamps(ctx.actorId) },
  };
}

/** Brings back a deleted person exactly as they were. */
export function restorePerson(ctx: WriteContext, person: Person): WriteOp {
  return {
    op: 'set',
    path: personPath(ctx, person.id),
    data: personDoc(person, restoreStamps(person, ctx.actorId)),
  };
}

/** Brings back a deleted relationship exactly as it was. */
export function restoreLink(ctx: WriteContext, link: Relationship): WriteOp {
  return {
    op: 'set',
    path: linkPath(ctx, link.id),
    data: { ...relationshipFields(link), ...restoreStamps(link, ctx.actorId) },
  };
}

export function remove(path: string): WriteOp {
  return { op: 'delete', path };
}

export function update(ctx: WriteContext, path: string, data: WriteData): WriteOp {
  return { op: 'update', path, data: { ...data, ...updateStamps(ctx.actorId) } };
}

/** Updates the tree: optional person count change and fields, always with fresh stamps. */
export function touchTree(ctx: WriteContext, countChange = 0, fields: WriteData = {}): WriteOp {
  return update(ctx, paths.tree(ctx.treeId), {
    ...fields,
    ...(countChange !== 0 && { personCount: increment(countChange) }),
  });
}

let commandCount = 0;

/** A unique ID for a history entry (not a document ID). */
export function commandId(): string {
  commandCount += 1;
  return `cmd${commandCount}`;
}

/** The paths of every write, for conflict checks. */
export function touchedPaths(ops: readonly WriteOp[]): string[] {
  return [...new Set(ops.map((op) => op.path))];
}
