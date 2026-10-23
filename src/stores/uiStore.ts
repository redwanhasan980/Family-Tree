import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

import type { ID, ViewKind } from '@/lib/domain/types';

/**
 * Editor UI state shared by every view (DESIGN §11.4). The view and the collapsed
 * branches are remembered per tree in this browser (VIS-10).
 */
export interface UiState {
  treeId: ID | null;
  view: ViewKind;
  selectedId: ID | null;
  focusId: ID | null;
  /** Collapsed path keys per view. */
  collapsed: Partial<Record<ViewKind, readonly string[]>>;

  /**
   * Starts a tree: the view comes from `initial.view` (the URL), then what this browser
   * remembers, then the tree's default, skipping views not in `allowed`.
   */
  openTree: (treeId: ID, defaultView: ViewKind, initial?: InitialUi) => void;
  /** The editor closed, so opening the tree again starts afresh. */
  closeTree: () => void;
  setView: (view: ViewKind) => void;
  select: (personId: ID | null) => void;
  focus: (personId: ID | null) => void;
  toggleCollapsed: (key: string) => void;
}

export interface InitialUi {
  view?: ViewKind;
  focusId?: ID;
  allowed?: readonly ViewKind[];
}

const storageKey = (treeId: ID) => `shikor:ui:${treeId}`;

interface Saved {
  view?: ViewKind;
  collapsed?: UiState['collapsed'];
}

// Per-browser convenience only: storage may be blocked or full.
function load(treeId: ID): Saved {
  try {
    return JSON.parse(window.localStorage.getItem(storageKey(treeId)) ?? '{}') as Saved;
  } catch {
    return {};
  }
}

function save(state: UiState): void {
  if (!state.treeId) return;
  try {
    const saved: Saved = { view: state.view, collapsed: state.collapsed };
    window.localStorage.setItem(storageKey(state.treeId), JSON.stringify(saved));
  } catch {
    // Not remembered this time.
  }
}

export function createUiStore() {
  return createStore<UiState>()((set, get) => ({
    treeId: null,
    view: 'tree',
    selectedId: null,
    focusId: null,
    collapsed: {},
    openTree: (treeId, defaultView, { view, focusId, allowed } = {}) => {
      const saved = load(treeId);
      const usable = (v: ViewKind | undefined): v is ViewKind =>
        v !== undefined && (!allowed || allowed.includes(v));
      set({
        treeId,
        view: [view, saved.view, defaultView].find(usable) ?? 'tree',
        collapsed: saved.collapsed ?? {},
        selectedId: null,
        focusId: focusId ?? null,
      });
    },
    closeTree: () => set({ treeId: null, selectedId: null, focusId: null }),
    setView: (view) => {
      set({ view });
      save(get());
    },
    select: (selectedId) => set({ selectedId }),
    focus: (focusId) => set({ focusId }),
    toggleCollapsed: (key) => {
      const { view, collapsed } = get();
      const keys = new Set(collapsed[view] ?? []);
      if (keys.has(key)) keys.delete(key);
      else keys.add(key);
      set({ collapsed: { ...collapsed, [view]: [...keys] } });
      save(get());
    },
  }));
}

export const uiStore = createUiStore();

export function useUi<T>(selector: (state: UiState) => T): T {
  return useStore(uiStore, selector);
}
