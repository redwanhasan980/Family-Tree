import { act, renderHook } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '@/../messages/en.json';
import { makePerson } from '@/lib/domain/fixtures/factories';
import { DEFAULT_TREE_SETTINGS } from '@/lib/domain/schemas';
import type { Tree } from '@/lib/domain/types';
import { treeStore } from '@/stores/treeStore';

import { useTreeGrowth } from './useTreeGrowth';

import type { ReactNode } from 'react';

const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { success: toastSuccess } }));
const burst = vi.hoisted(() => vi.fn());
vi.mock('./confetti', () => ({ burstConfetti: burst }));

const tree: Tree = {
  id: 't1',
  name: 'Karim family',
  ownerId: 'u1',
  memberIds: ['u1'],
  roles: { u1: 'owner' },
  rootPersonId: 'p0',
  personCount: 0,
  settings: { ...DEFAULT_TREE_SETTINGS },
  createdAt: new Date(0),
  updatedAt: new Date(0),
  updatedBy: 'u1',
  schemaVersion: 1,
};

const wrapper = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="en" messages={messages}>
    {children}
  </NextIntlClientProvider>
);

/** Opens a tree of `count` people, as the server has it. */
function openTree(count: number) {
  const store = treeStore.getState();
  store.open('t1');
  store.hydrate({
    tree,
    persons: Array.from({ length: count }, (_, index) => makePerson(`p${index}`)),
    relationships: [],
  });
}

/** One more person arrives: the user's own change (pending) or someone else's. */
function addPerson(id: string, own: boolean) {
  treeStore.getState().applyPersons([{ type: 'added', id, value: makePerson(id) }], {
    fromCache: own,
    hasPendingWrites: own,
  });
}

beforeEach(() => window.localStorage.clear());

afterEach(() => {
  treeStore.getState().close();
  vi.clearAllMocks();
});

describe('useTreeGrowth', () => {
  it('celebrates the 10th person once, when the user added them (UX-04)', () => {
    openTree(9);
    renderHook(() => useTreeGrowth('t1'), { wrapper });
    act(() => addPerson('p9', true));
    expect(toastSuccess).toHaveBeenCalledWith('10 people in your family tree. Well done!');
    expect(burst).toHaveBeenCalledTimes(1);

    // Undone and done again: no second celebration.
    act(() =>
      treeStore.getState().applyPersons([{ type: 'removed', id: 'p9', value: null }], {
        fromCache: true,
        hasPendingWrites: true,
      }),
    );
    act(() => addPerson('p9', true));
    expect(toastSuccess).toHaveBeenCalledTimes(1);
  });

  it("stays quiet for a collaborator's change", () => {
    openTree(9);
    renderHook(() => useTreeGrowth('t1'), { wrapper });
    act(() => addPerson('p9', false));
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('reports when the user brings a tree to five people (AUTH-03)', () => {
    openTree(3);
    const { result } = renderHook(() => useTreeGrowth('t1'), { wrapper });
    act(() => addPerson('p3', true));
    expect(result.current).toBe(false);
    act(() => addPerson('p4', true));
    expect(result.current).toBe(true);
  });

  it('does not count opening a big tree as growth', () => {
    const { result } = renderHook(() => useTreeGrowth('t1'), { wrapper });
    act(() => openTree(12));
    expect(result.current).toBe(false);
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
