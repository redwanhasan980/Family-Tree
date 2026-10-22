import { describe, expect, it } from 'vitest';

import { makeParentLink, makePerson } from '@/lib/domain/fixtures/factories';
import { DEFAULT_TREE_SETTINGS } from '@/lib/domain/schemas';
import type { Tree } from '@/lib/domain/types';

import { createTreeStore, selectGraph, selectSaveStatus } from './treeStore';

const at = new Date('2026-01-01T00:00:00Z');
const tree: Tree = {
  id: 't1',
  name: 'T',
  ownerId: 'u1',
  memberIds: ['u1'],
  roles: { u1: 'owner' },
  personCount: 2,
  settings: { ...DEFAULT_TREE_SETTINGS },
  createdAt: at,
  updatedAt: at,
  updatedBy: 'u1',
  schemaVersion: 1,
};
const server = { fromCache: false, hasPendingWrites: false };
const cache = { fromCache: true, hasPendingWrites: false };

describe('treeStore', () => {
  it('applies listener changes and counts versions', () => {
    const store = createTreeStore();
    store.getState().open('t1');
    expect(store.getState().status).toBe('loading');
    store.getState().applyTree(tree, server);
    store.getState().applyPersons(
      [
        { type: 'added', id: 'a', value: makePerson('a') },
        { type: 'added', id: 'b', value: makePerson('b') },
      ],
      server,
    );
    store
      .getState()
      .applyRelationships(
        [{ type: 'added', id: 'p_a_b', value: makeParentLink('a', 'b') }],
        server,
      );
    expect(store.getState()).toMatchObject({ status: 'ready', version: 3 });
    expect(
      selectGraph(store.getState())
        .childrenOf.get('a')
        ?.map((l) => l.childId),
    ).toEqual(['b']);

    store.getState().applyPersons([{ type: 'removed', id: 'b', value: null }], server);
    expect([...store.getState().persons.keys()]).toEqual(['a']);
    // No changes, only metadata: same version and same maps.
    const before = store.getState().persons;
    store.getState().applyPersons([], { fromCache: false, hasPendingWrites: true });
    expect(store.getState().persons).toBe(before);
    expect(store.getState().version).toBe(4);
  });

  it('rebuilds the graph only when data changes', () => {
    const store = createTreeStore();
    store.getState().applyPersons([{ type: 'added', id: 'a', value: makePerson('a') }], server);
    const first = selectGraph(store.getState());
    store.getState().applyPersons([], server);
    expect(selectGraph(store.getState())).toBe(first);
    store
      .getState()
      .applyPersons(
        [{ type: 'modified', id: 'a', value: makePerson('a', { nickname: 'x' }) }],
        server,
      );
    expect(selectGraph(store.getState())).not.toBe(first);
  });

  it('shows the cached copy until the listeners answer', () => {
    const store = createTreeStore();
    store.getState().open('t1');
    store.getState().hydrate({ tree, persons: [makePerson('a')], relationships: [] });
    expect(store.getState()).toMatchObject({ status: 'ready', version: 1 });
    store.getState().applyPersons([{ type: 'added', id: 'b', value: makePerson('b') }], server);
    store.getState().hydrate({ tree, persons: [], relationships: [] });
    expect(store.getState().persons.size).toBe(2);
  });

  it('reports a missing tree only when the server says so', () => {
    const store = createTreeStore();
    store.getState().open('t1');
    store.getState().applyTree(null, cache);
    expect(store.getState().status).toBe('loading');
    store.getState().applyTree(null, server);
    expect(store.getState().status).toBe('missing');
    store.getState().fail('permission-denied');
    expect(store.getState()).toMatchObject({ status: 'error', errorCode: 'permission-denied' });
    store.getState().close();
    expect(store.getState()).toMatchObject({ status: 'idle', treeId: null, version: 0 });
  });

  it('derives the save status (TREE-07)', () => {
    const store = createTreeStore();
    expect(selectSaveStatus(store.getState(), true)).toBe('saved');
    store.getState().applyPersons([], { fromCache: true, hasPendingWrites: true });
    expect(selectSaveStatus(store.getState(), true)).toBe('saving');
    expect(selectSaveStatus(store.getState(), false)).toBe('offline');
    store.getState().applyPersons([], server);
    expect(selectSaveStatus(store.getState(), true)).toBe('saved');
    expect(store.getState().fromServer.persons).toBe(true);
  });
});
