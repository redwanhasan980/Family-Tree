import { afterEach, describe, expect, it, vi } from 'vitest';

import { createUiStore } from './uiStore';

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('uiStore', () => {
  it('remembers the view and collapsed branches per tree (VIS-10)', () => {
    const store = createUiStore();
    store.getState().openTree('t1', 'tree');
    store.getState().toggleCollapsed('G/S1');
    store.getState().setView('list');
    store.getState().toggleCollapsed('G/D1');
    expect(store.getState().collapsed).toEqual({ tree: ['G/S1'], list: ['G/D1'] });

    const later = createUiStore();
    later.getState().openTree('t1', 'tree');
    expect(later.getState()).toMatchObject({
      view: 'list',
      collapsed: { tree: ['G/S1'], list: ['G/D1'] },
    });
    later.getState().toggleCollapsed('G/D1');
    expect(later.getState().collapsed.list).toEqual([]);

    const other = createUiStore();
    other.getState().openTree('t2', 'family');
    expect(other.getState()).toMatchObject({ view: 'family', collapsed: {} });
  });

  it('tracks selection and focus', () => {
    const store = createUiStore();
    store.getState().select('p1');
    store.getState().focus('p2');
    expect(store.getState()).toMatchObject({ selectedId: 'p1', focusId: 'p2' });
  });

  it('works when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const store = createUiStore();
    store.getState().openTree('t1', 'circle');
    expect(() => store.getState().setView('list')).not.toThrow();
    expect(store.getState().view).toBe('list');
  });
});
