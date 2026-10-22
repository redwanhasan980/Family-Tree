import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

import { buildGraph, type FamilyGraph } from '@/lib/domain/graph';
import type { ID, Person, Relationship, Tree } from '@/lib/domain/types';
import type { DocChange, SnapshotMeta } from '@/lib/repositories/trees';

export type TreeStatus = 'idle' | 'loading' | 'ready' | 'missing' | 'error';
type Source = 'tree' | 'persons' | 'relationships';

export interface TreeState {
  treeId: ID | null;
  tree: Tree | null;
  persons: ReadonlyMap<ID, Person>;
  relationships: ReadonlyMap<string, Relationship>;
  /** Increases on every data change; views memoize on it. */
  version: number;
  status: TreeStatus;
  /** Firebase error code when status is "error" (for example "permission-denied"). */
  errorCode: string | null;
  /** Unconfirmed local writes per listener (TREE-07). */
  pending: Record<Source, boolean>;
  /** Whether each listener has heard from the server yet. */
  fromServer: Record<Source, boolean>;

  open: (treeId: ID) => void;
  hydrate: (data: { tree: Tree; persons: Person[]; relationships: Relationship[] }) => void;
  applyTree: (tree: Tree | null, meta: SnapshotMeta) => void;
  applyPersons: (changes: DocChange<Person>[], meta: SnapshotMeta) => void;
  applyRelationships: (changes: DocChange<Relationship>[], meta: SnapshotMeta) => void;
  fail: (code: string) => void;
  close: () => void;
}

const EMPTY = {
  treeId: null,
  tree: null,
  persons: new Map<ID, Person>(),
  relationships: new Map<string, Relationship>(),
  version: 0,
  status: 'idle' as TreeStatus,
  errorCode: null,
  pending: { tree: false, persons: false, relationships: false },
  fromServer: { tree: false, persons: false, relationships: false },
};

function applyChanges<T>(
  map: ReadonlyMap<string, T>,
  changes: readonly DocChange<T>[],
): ReadonlyMap<string, T> {
  if (changes.length === 0) return map;
  const next = new Map(map);
  for (const change of changes) {
    if (change.type === 'removed' || change.value === null) next.delete(change.id);
    else next.set(change.id, change.value);
  }
  return next;
}

export function createTreeStore() {
  return createStore<TreeState>()((set, get) => ({
    ...EMPTY,
    open: (treeId) => set({ ...EMPTY, treeId, status: 'loading' }),
    // The device cache, shown before the listeners answer. Ignored once they have.
    hydrate: ({ tree, persons, relationships }) => {
      if (get().version > 0 || get().status !== 'loading') return;
      set({
        tree,
        persons: new Map(persons.map((p) => [p.id, p])),
        relationships: new Map(relationships.map((r) => [r.id, r])),
        version: 1,
        status: 'ready',
      });
    },
    applyTree: (tree, meta) =>
      set((state) => {
        const sync = {
          pending: { ...state.pending, tree: meta.hasPendingWrites },
          fromServer: { ...state.fromServer, tree: state.fromServer.tree || !meta.fromCache },
        };
        // A missing tree only counts once the server confirms it (deleted, or access removed).
        if (!tree)
          return meta.fromCache ? sync : { ...sync, tree: null, status: 'missing' as const };
        return { ...sync, tree, status: 'ready' as const, version: state.version + 1 };
      }),
    applyPersons: (changes, meta) =>
      set((state) => ({
        persons: applyChanges(state.persons, changes),
        version: changes.length > 0 ? state.version + 1 : state.version,
        pending: { ...state.pending, persons: meta.hasPendingWrites },
        fromServer: { ...state.fromServer, persons: state.fromServer.persons || !meta.fromCache },
      })),
    applyRelationships: (changes, meta) =>
      set((state) => ({
        relationships: applyChanges(state.relationships, changes),
        version: changes.length > 0 ? state.version + 1 : state.version,
        pending: { ...state.pending, relationships: meta.hasPendingWrites },
        fromServer: {
          ...state.fromServer,
          relationships: state.fromServer.relationships || !meta.fromCache,
        },
      })),
    fail: (code) => set({ status: 'error', errorCode: code }),
    close: () => set({ ...EMPTY }),
  }));
}

/** The open tree. One tree is open at a time. */
export const treeStore = createTreeStore();

export function useTree<T>(selector: (state: TreeState) => T): T {
  return useStore(treeStore, selector);
}

let memo: {
  persons: TreeState['persons'];
  relationships: TreeState['relationships'];
  graph: FamilyGraph;
} | null = null;

/** The family graph, rebuilt only when people or relationships change (DESIGN §11.2). */
export function selectGraph(state: Pick<TreeState, 'persons' | 'relationships'>): FamilyGraph {
  if (!memo || memo.persons !== state.persons || memo.relationships !== state.relationships) {
    memo = {
      persons: state.persons,
      relationships: state.relationships,
      graph: buildGraph(state.persons, state.relationships.values()),
    };
  }
  return memo.graph;
}

export type SaveStatus = 'saving' | 'saved' | 'offline';

/** "Saving…", "Saved" or "Offline: changes will sync" (TREE-07, PWA-03). */
export function selectSaveStatus(state: Pick<TreeState, 'pending'>, online: boolean): SaveStatus {
  if (!online) return 'offline';
  return state.pending.tree || state.pending.persons || state.pending.relationships
    ? 'saving'
    : 'saved';
}
