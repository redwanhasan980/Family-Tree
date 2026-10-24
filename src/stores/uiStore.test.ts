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

  it('starts from the URL, then memory, then the default, among allowed views', () => {
    const store = createUiStore();
    store.getState().openTree('t1', 'tree');
    store.getState().setView('album');
    const allowed = ['tree', 'family', 'circle', 'list'] as const;

    store.getState().openTree('t1', 'family', { allowed });
    expect(store.getState().view).toBe('family');
    store.getState().openTree('t1', 'family', { view: 'list', focusId: 'p9', allowed });
    expect(store.getState()).toMatchObject({ view: 'list', focusId: 'p9' });
    store.getState().openTree('t1', 'album', { view: 'timeline', allowed });
    expect(store.getState().view).toBe('tree');
    store.getState().openTree('t1', 'tree', { view: 'circle' });
    expect(store.getState().view).toBe('circle');

    store.getState().select('p1');
    store.getState().closeTree();
    expect(store.getState()).toMatchObject({ treeId: null, selectedId: null, focusId: null });
  });

  it('remembers collapse states, the orientation and the list mode (VIS-10, TV-02, LV-04)', () => {
    const store = createUiStore();
    store.getState().openTree('t3', 'tree');
    expect(store.getState().collapsed.tree).toBeUndefined();
    expect(store.getState().listMode).toBe('outline');
    store.getState().setCollapsed('tree', ['a', 'b']);
    store.getState().setOrientation('horizontal');
    store.getState().setListMode('directory');
    const later = createUiStore();
    later.getState().openTree('t3', 'tree');
    expect(later.getState()).toMatchObject({
      collapsed: { tree: ['a', 'b'] },
      orientation: 'horizontal',
      listMode: 'directory',
    });
  });

  it('tracks selection and focus', () => {
    const store = createUiStore();
    store.getState().select('p1');
    store.getState().focus('p2');
    expect(store.getState()).toMatchObject({ selectedId: 'p1', focusId: 'p2' });
  });

  it('asks the view to reveal someone, selecting them (VIS-04)', () => {
    const store = createUiStore();
    store.getState().openTree('t1', 'tree');
    store.getState().select('p1');
    store.getState().setDetailsOpen(true);
    store.getState().reveal('p2');
    expect(store.getState()).toMatchObject({
      selectedId: 'p2',
      detailsOpen: false,
      revealRequest: { personId: 'p2', nonce: 1 },
    });
    // The same person again is a new request.
    store.getState().reveal('p2');
    expect(store.getState().revealRequest).toEqual({ personId: 'p2', nonce: 2 });
    store.getState().revealDone();
    expect(store.getState().revealRequest).toBeNull();
  });

  it('opens families without moving the start of the other views (FC-02, FC-06)', () => {
    const store = createUiStore();
    store.getState().openTree('t1', 'family');
    store.getState().openFamily('p2');
    expect(store.getState()).toMatchObject({
      familyId: 'p2',
      selectedId: 'p2',
      focusId: null,
      revealRequest: { personId: 'p2' },
    });
    store.getState().openFamily(null);
    expect(store.getState()).toMatchObject({
      familyId: null,
      selectedId: null,
      revealRequest: null,
    });
  });

  it('opens the Family card on the selected person, and follows search there', () => {
    const store = createUiStore();
    store.getState().openTree('t1', 'tree');
    store.getState().select('p4');
    store.getState().setView('family');
    expect(store.getState().familyId).toBe('p4');
    store.getState().reveal('p5');
    expect(store.getState().familyId).toBe('p5');
    store.getState().setView('tree');
    store.getState().reveal('p6');
    expect(store.getState().familyId).toBe('p5');
  });

  it('starts on the family in the link', () => {
    const store = createUiStore();
    store.getState().openTree('t1', 'tree', { view: 'family', familyId: 'p7' });
    expect(store.getState()).toMatchObject({ view: 'family', familyId: 'p7', selectedId: 'p7' });
  });

  it('forgets open dialogs when the tree closes', () => {
    const store = createUiStore();
    store.getState().openTree('t1', 'tree');
    store.getState().setDeleting('p1');
    store.getState().setSearchOpen(true);
    store.getState().reveal('p2');
    store.getState().closeTree();
    expect(store.getState()).toMatchObject({
      deletingId: null,
      searchOpen: false,
      revealRequest: null,
    });
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
