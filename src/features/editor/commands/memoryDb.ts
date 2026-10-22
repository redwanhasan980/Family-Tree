import {
  personDoc,
  personFromDoc,
  relationshipFields,
  relationshipFromDoc,
  treeFromDoc,
} from '@/lib/domain/documents';
import { buildGraph } from '@/lib/domain/graph';
import { DEFAULT_TREE_SETTINGS } from '@/lib/domain/schemas';
import type { ID, Person, Relationship } from '@/lib/domain/types';
import { isFieldOp, paths, type WriteData, type WriteOp } from '@/lib/domain/writes';

import type { CommandContext } from './types';

type Doc = Record<string, unknown>;

/**
 * Test support: a tiny in-memory Firestore that applies write batches with the same
 * semantics (field paths, server time, increments, deleted fields, atomic batches), so
 * command round-trips can be checked without the emulator.
 */
export class MemoryDb {
  readonly docs = new Map<string, Doc>();
  private tick = 0;

  constructor(private readonly epoch = Date.UTC(2026, 0, 1)) {}

  /** A server clock that moves forward on every batch. */
  private now(): Date {
    return new Date(this.epoch + this.tick * 1000);
  }

  apply(ops: readonly WriteOp[]): void {
    this.tick += 1;
    const next = new Map([...this.docs].map(([path, doc]) => [path, structuredClone(doc)]));
    for (const op of ops) {
      if (op.op === 'delete') next.delete(op.path);
      else if (op.op === 'set') next.set(op.path, this.resolve(op.data, undefined) as Doc);
      else {
        const current = next.get(op.path);
        if (!current) throw new Error(`No document to update: ${op.path}`);
        for (const [key, value] of Object.entries(op.data))
          this.setPath(current, key.split('.'), value);
      }
    }
    this.docs.clear();
    for (const [path, doc] of next) this.docs.set(path, doc);
  }

  private resolve(value: unknown, current: unknown): unknown {
    if (isFieldOp(value)) {
      if (value.fieldOp === 'serverTime') return this.now();
      if (value.fieldOp === 'increment')
        return (typeof current === 'number' ? current : 0) + value.by;
      throw new Error('deleteField is only allowed in updates');
    }
    if (value instanceof Date) return new Date(value);
    if (Array.isArray(value)) return value.map((v) => this.resolve(v, undefined));
    if (typeof value === 'object' && value !== null) {
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, this.resolve(v, undefined)]),
      );
    }
    return value;
  }

  private setPath(doc: Doc, keys: string[], value: unknown): void {
    const [head, ...rest] = keys as [string, ...string[]];
    if (rest.length > 0) {
      const child =
        typeof doc[head] === 'object' && doc[head] !== null ? (doc[head] as Doc) : (doc[head] = {});
      this.setPath(child, rest, value);
    } else if (isFieldOp(value) && value.fieldOp === 'deleteField') {
      delete doc[head];
    } else {
      doc[head] = this.resolve(value, doc[head]);
    }
  }

  /** Seeds a tree with people and relationships, stamped by `ownerId`. */
  seedTree(
    treeId: ID,
    ownerId: ID,
    persons: readonly Person[],
    links: readonly Relationship[],
    rootPersonId?: ID,
  ): void {
    const at = this.now();
    const stamps = {
      createdAt: at,
      createdBy: ownerId,
      updatedAt: at,
      updatedBy: ownerId,
      schemaVersion: 1,
    };
    this.docs.set(paths.tree(treeId), {
      name: 'Test tree',
      ownerId,
      memberIds: [ownerId],
      roles: { [ownerId]: 'owner' },
      ...(rootPersonId && { rootPersonId }),
      personCount: persons.length,
      settings: { ...DEFAULT_TREE_SETTINGS },
      createdAt: at,
      updatedAt: at,
      updatedBy: ownerId,
      schemaVersion: 1,
    });
    for (const p of persons)
      this.docs.set(
        paths.person(treeId, p.id),
        personDoc(p, { ...stamps, createdAt: p.createdAt }),
      );
    for (const l of links)
      this.docs.set(paths.relationship(treeId, l.id), { ...relationshipFields(l), ...stamps });
  }

  /** The current tree, people and graph, as a command context. */
  context(treeId: ID, actorId: ID, newId: () => ID): CommandContext {
    const at = this.now();
    const persons: Person[] = [];
    const links: Relationship[] = [];
    for (const [path, data] of this.docs) {
      const person = path.startsWith(`${paths.persons(treeId)}/`);
      const link = path.startsWith(`${paths.relationships(treeId)}/`);
      const id = path.slice(path.lastIndexOf('/') + 1);
      if (person) persons.push(personFromDoc(id, data, at)!);
      if (link) links.push(relationshipFromDoc(id, data, at)!);
    }
    const tree = treeFromDoc(treeId, this.docs.get(paths.tree(treeId)), at);
    if (!tree) throw new Error(`No tree ${treeId}`);
    return { treeId, tree, graph: buildGraph(persons, links), actorId, newId };
  }

  /**
   * The data without update stamps (undo writes fresh ones). With `ignoreCreated`, also
   * without creation times, which differ when redo creates a document again.
   */
  content({ ignoreCreated = false } = {}): Map<string, WriteData> {
    return new Map(
      [...this.docs].map(([path, doc]) => {
        const { updatedAt: _ua, updatedBy: _ub, createdAt, ...rest } = doc;
        return [
          path,
          ignoreCreated ? rest : { ...rest, ...(createdAt !== undefined && { createdAt }) },
        ];
      }),
    );
  }
}

/** Deterministic IDs for tests: n1, n2, … */
export function idSequence(prefix = 'n'): () => ID {
  let n = 0;
  return () => `${prefix}${++n}`;
}
