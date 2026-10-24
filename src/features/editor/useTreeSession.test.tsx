import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { makePerson } from '@/lib/domain/fixtures/factories';
import type { DocChange, SnapshotMeta } from '@/lib/repositories/trees';
import { historyStore } from '@/stores/historyStore';
import { treeStore } from '@/stores/treeStore';

import { useLeaveWarning, useOnline, useSaveStatus, useTreeSession } from './useTreeSession';

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

  it('listens again to a tree just created here that the server has yet to get', () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { result, unmount } = renderHook(() => useTreeSession('t1'));
    const pending = { fromCache: true, hasPendingWrites: true };
    act(() => repo.tree!({ id: 't1', name: 'T' }, pending));
    act(() => repo.error!({ code: 'permission-denied' }));
    // The first listeners stopped; the tree stays on screen.
    expect(result.current.status).toBe('ready');
    expect(repo.stops.slice(0, 3).every((stop) => stop.mock.calls.length === 1)).toBe(true);
    act(() => vi.advanceTimersByTime(500));
    expect(repo.stops).toHaveLength(6);
    act(() => repo.tree!({ id: 't1', name: 'T' }, { fromCache: false, hasPendingWrites: false }));
    expect(result.current.status).toBe('ready');

    // Once the server has it, a refusal is real.
    act(() => repo.error!({ code: 'permission-denied' }));
    expect(result.current).toEqual({ status: 'error', errorCode: 'permission-denied' });
    unmount();
    vi.useRealTimers();
  });

  it('gives up after a few tries', () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { result, unmount } = renderHook(() => useTreeSession('t1'));
    for (const delay of [500, 1000, 2000, 4000]) {
      act(() => repo.tree!({ id: 't1', name: 'T' }, { fromCache: true, hasPendingWrites: true }));
      act(() => repo.error!({ code: 'permission-denied' }));
      expect(result.current.status).toBe('ready');
      act(() => vi.advanceTimersByTime(delay));
    }
    act(() => repo.error!({ code: 'permission-denied' }));
    expect(result.current.status).toBe('error');
    unmount();
    vi.useRealTimers();
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

  it('asks before leaving only while a change is unsent', () => {
    const leave = () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    const { unmount } = renderHook(() => {
      useTreeSession('t1');
      useLeaveWarning();
    });
    expect(leave()).toBe(false);
    act(() => repo.persons!([], { fromCache: false, hasPendingWrites: true }));
    expect(leave()).toBe(true);
    act(() => repo.persons!([], { fromCache: false, hasPendingWrites: false }));
    expect(leave()).toBe(false);
    unmount();
  });
});
