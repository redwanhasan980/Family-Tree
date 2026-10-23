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
  /** Phones: whether the selected person's details sheet is open (not just the bar). */
  detailsOpen: boolean;
  focusId: ID | null;
  /** The Tree view shows this person's ancestors instead of descendants (TV-06). */
  pedigreeId: ID | null;
  addFlow: AddFlow | null;
  /** Collapsed path keys per view; missing until the view saves a state. */
  collapsed: Partial<Record<ViewKind, readonly string[]>>;
  /** Tree view direction (TV-02). */
  orientation: 'vertical' | 'horizontal';
  /** The List view as family lines or as everyone (LV-04). */
  listMode: ListMode;
  /** Generations the Circle view shows around the centre (CV-04). */
  circleRings: number;
  /** Someone to bring into view; the current view shows them, then clears it (VIS-04). */
  revealRequest: { personId: ID; nonce: number } | null;
  /** The person whose delete confirmation is open (PER-06, the Del key). */
  deletingId: ID | null;
  /** The "Find someone" search (UX-03). */
  searchOpen: boolean;

  /**
   * Starts a tree: the view comes from `initial.view` (the URL), then what this browser
   * remembers, then the tree's default, skipping views not in `allowed`.
   */
  openTree: (treeId: ID, defaultView: ViewKind, initial?: InitialUi) => void;
  /** The editor closed, so opening the tree again starts afresh. */
  closeTree: () => void;
  setView: (view: ViewKind) => void;
  select: (personId: ID | null) => void;
  setDetailsOpen: (open: boolean) => void;
  startAdd: (flow: AddFlow) => void;
  endAdd: () => void;
  /** Shows the tree from someone: their descendants (and leaves the pedigree). */
  focus: (personId: ID | null) => void;
  /** Opens the Tree view's pedigree of someone, or goes back to the family tree. */
  showAncestors: (personId: ID | null) => void;
  toggleCollapsed: (key: string) => void;
  /** Replaces a view's collapsed keys (expand all, show N generations, defaults). */
  setCollapsed: (view: ViewKind, keys: readonly string[]) => void;
  setOrientation: (orientation: UiState['orientation']) => void;
  setListMode: (mode: ListMode) => void;
  setCircleRings: (rings: number) => void;
  /** Selects someone and asks the current view to expand the way to them and centre them. */
  reveal: (personId: ID) => void;
  revealDone: () => void;
  setDeleting: (personId: ID | null) => void;
  setSearchOpen: (open: boolean) => void;
}

export type ListMode = 'outline' | 'directory';

/** The Circle view's depth control (CV-04): 2–8 rings, 5 at first. */
export const MIN_CIRCLE_RINGS = 2;
export const MAX_CIRCLE_RINGS = 8;
export const DEFAULT_CIRCLE_RINGS = 5;

/** Adding a relative (REL-02): the quick-add menu, or a form for one kind of relative. */
export type AddKind = 'menu' | 'child' | 'spouse' | 'parent' | 'sibling' | 'link';

export interface AddFlow {
  personId: ID;
  kind: AddKind;
  /** Screen rectangle the desktop menu opens next to. */
  anchor?: { x: number; y: number; width: number; height: number };
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
  orientation?: UiState['orientation'];
  listMode?: ListMode;
  circleRings?: number;
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
    const saved: Saved = {
      view: state.view,
      collapsed: state.collapsed,
      orientation: state.orientation,
      listMode: state.listMode,
      circleRings: state.circleRings,
    };
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
    detailsOpen: false,
    focusId: null,
    pedigreeId: null,
    addFlow: null,
    collapsed: {},
    orientation: 'vertical',
    listMode: 'outline',
    circleRings: DEFAULT_CIRCLE_RINGS,
    revealRequest: null,
    deletingId: null,
    searchOpen: false,
    openTree: (treeId, defaultView, { view, focusId, allowed } = {}) => {
      const saved = load(treeId);
      const usable = (v: ViewKind | undefined): v is ViewKind =>
        v !== undefined && (!allowed || allowed.includes(v));
      set({
        treeId,
        view: [view, saved.view, defaultView].find(usable) ?? 'tree',
        collapsed: saved.collapsed ?? {},
        orientation: saved.orientation ?? 'vertical',
        listMode: saved.listMode ?? 'outline',
        circleRings: saved.circleRings ?? DEFAULT_CIRCLE_RINGS,
        addFlow: null,
        selectedId: null,
        focusId: focusId ?? null,
        pedigreeId: null,
        revealRequest: null,
        deletingId: null,
        searchOpen: false,
      });
    },
    closeTree: () =>
      set({
        treeId: null,
        selectedId: null,
        focusId: null,
        pedigreeId: null,
        addFlow: null,
        revealRequest: null,
        deletingId: null,
        searchOpen: false,
      }),
    setView: (view) => {
      set({ view });
      save(get());
    },
    select: (selectedId) => set({ selectedId, detailsOpen: false }),
    setDetailsOpen: (detailsOpen) => set({ detailsOpen }),
    startAdd: (addFlow) => set({ addFlow }),
    endAdd: () => set({ addFlow: null }),
    focus: (focusId) => set({ focusId, pedigreeId: null }),
    showAncestors: (pedigreeId) => {
      if (pedigreeId) set({ pedigreeId, view: 'tree' });
      else set({ pedigreeId: null });
      save(get());
    },
    toggleCollapsed: (key) => {
      const { view, collapsed } = get();
      const keys = new Set(collapsed[view] ?? []);
      if (keys.has(key)) keys.delete(key);
      else keys.add(key);
      set({ collapsed: { ...collapsed, [view]: [...keys] } });
      save(get());
    },
    setCollapsed: (view, keys) => {
      set({ collapsed: { ...get().collapsed, [view]: [...keys] } });
      save(get());
    },
    setOrientation: (orientation) => {
      set({ orientation });
      save(get());
    },
    setListMode: (listMode) => {
      set({ listMode });
      save(get());
    },
    setCircleRings: (rings) => {
      set({
        circleRings: Math.min(MAX_CIRCLE_RINGS, Math.max(MIN_CIRCLE_RINGS, Math.round(rings))),
      });
      save(get());
    },
    reveal: (personId) =>
      set(({ revealRequest }) => ({
        selectedId: personId,
        detailsOpen: false,
        revealRequest: { personId, nonce: (revealRequest?.nonce ?? 0) + 1 },
      })),
    revealDone: () => set({ revealRequest: null }),
    setDeleting: (deletingId) => set({ deletingId }),
    setSearchOpen: (searchOpen) => set({ searchOpen }),
  }));
}

export const uiStore = createUiStore();

export function useUi<T>(selector: (state: UiState) => T): T {
  return useStore(uiStore, selector);
}
