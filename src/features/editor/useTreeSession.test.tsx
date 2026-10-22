import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { makePerson } from '@/lib/domain/fixtures/factories';
import type { DocChange, SnapshotMeta } from '@/lib/repositories/trees';
import { historyStore } from '@/stores/historyStore';
import { treeStore } from '@/stores/treeStore';

import { useOnline, useSaveStatus, useTreeSession } from './useTreeSession';

const repo = vi.hoisted(() => ({
  stops: [] as ReturnType<typeof vi.fn>[],
  persons: null as null | ((changes: DocChange<unknown>[], meta: SnapshotMeta) => void),
  tree: null as null | ((tree: unknown, meta: SnapshotMeta) => void),
  error: null as null | ((error: unknown) => void),
  cached: null as unknown,
}));

vi.mock('@/lib/repositories/trees', () => {
  const stop = () => {
    const fn = vi.fn();
    repo.stops.push(fn);
    return fn;
  };
  return {
    readTreeFromCache: () => Promise.resolve(repo.cached),
    subscribeTree: (_id: string, onTree: typeof repo.tree, onError: typeof repo.error) => {
      repo.tree = onTree;
      repo.error = onError;
      return stop();
    },
    subscribePersons: (_id: string, onChanges: typeof repo.persons) => {
      repo.persons = onChanges;
      return stop();
    },
    subscribeRelationships: () => stop(),
  };
});

afterEach(() => {
  repo.stops = [];
  repo.cached = null;
  vi.restoreAllMocks();
});

describe('useTreeSession', () => {
  it('opens the tree, follows the listeners and closes on unmount', async () => {
    historyStore
      .getState()
      .record({ id: 'old', labelKey: 'x', forward: [], inverse: [], touched: [] }, 0);
    const { result, unmount } = renderHook(() => useTreeSession('t1'));
    expect(result.current.status).toBe('loading');
    expect(historyStore.getState().undoStack).toEqual([]);

    act(() => {
      repo.tree!({ id: 't1', name: 'T' }, { fromCache: false, hasPendingWrites: false });
      repo.persons!([{ type: 'added', id: 'a', value: makePerson('a') }], {
        fromCache: false,
        hasPendingWrites: true,
      });
    });
    expect(result.current.status).toBe('ready');
    expect(treeStore.getState().persons.has('a')).toBe(true);

    unmount();
    expect(repo.stops).toHaveLength(3);
    for (const stop of repo.stops) expect(stop).toHaveBeenCalled();
    expect(treeStore.getState().status).toBe('idle');
  });

  it('renders the cached copy first', async () => {
    repo.cached = { tree: { id: 't1' }, persons: [makePerson('c')], relationships: [] };
    const { result, unmount } = renderHook(() => useTreeSession('t1'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(treeStore.getState().persons.has('c')).toBe(true);
    unmount();
  });

  it('reports listener errors with their code', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { result, unmount } = renderHook(() => useTreeSession('t1'));
    act(() => repo.error!({ code: 'permission-denied' }));
    expect(result.current).toEqual({ status: 'error', errorCode: 'permission-denied' });
    unmount();
  });
});

describe('online and save status', () => {
  it('follows the browser’s online events', () => {
    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(true);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current).toBe(false);
  });

  it('turns pending writes into "saving"', () => {
    const { result, unmount } = renderHook(() => ({
      session: useTreeSession('t1'),
      save: useSaveStatus(),
    }));
    expect(result.current.save).toBe('saved');
    act(() => repo.persons!([], { fromCache: false, hasPendingWrites: true }));
    expect(result.current.save).toBe('saving');
    unmount();
  });
});
