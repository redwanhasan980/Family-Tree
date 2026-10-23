import { act, renderHook } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

import messages from '@/../messages/en.json';
import { DEFAULT_TREE_SETTINGS } from '@/lib/domain/schemas';
import type { Tree } from '@/lib/domain/types';
import { historyStore } from '@/stores/historyStore';
import { treeStore } from '@/stores/treeStore';

import { addPerson, updateTreeSettings } from './commands';
import { EditorProvider, useEditor } from './EditorProvider';

import type { ReactNode } from 'react';

const writes = vi.hoisted(() => ({
  commits: [] as unknown[][],
  fail: false,
  ids: 0,
}));

vi.mock('@/lib/repositories/writes', () => ({
  commitBatch: (ops: unknown[]) => {
    writes.commits.push(ops);
    return writes.fail ? Promise.reject(new Error('permission-denied')) : Promise.resolve();
  },
  newId: () => `id${++writes.ids}`,
}));

const toastError = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { error: toastError } }));

const tree: Tree = {
  id: 't1',
  name: 'Karim family',
  ownerId: 'u1',
  memberIds: ['u1'],
  roles: { u1: 'owner' },
  personCount: 0,
  settings: { ...DEFAULT_TREE_SETTINGS },
  createdAt: new Date(0),
  updatedAt: new Date(0),
  updatedBy: 'u1',
  schemaVersion: 1,
};

function wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <EditorProvider actorId="u1">{children}</EditorProvider>
    </NextIntlClientProvider>
  );
}

afterEach(() => {
  writes.commits = [];
  writes.fail = false;
  treeStore.getState().close();
  historyStore.getState().clear();
  toastError.mockReset();
});

describe('EditorProvider', () => {
  it('refuses commands until a tree is open', () => {
    const { result } = renderHook(() => useEditor(), { wrapper });
    expect(
      result.current.run((ctx) => addPerson(ctx, { names: { en: 'A' }, gender: 'male' })),
    ).toMatchObject({ ok: false, issues: [{ code: 'notReady' }] });
    expect(writes.commits).toEqual([]);
  });

  it('runs commands against the open tree as the user, with undo', async () => {
    treeStore.getState().open('t1');
    treeStore.getState().applyTree(tree, { fromCache: false, hasPendingWrites: false });
    const { result } = renderHook(() => useEditor(), { wrapper });

    const added = result.current.run((ctx) =>
      addPerson(ctx, { names: { bn: 'আব্দুল করিম' }, gender: 'male' }),
    );
    expect(added).toMatchObject({ ok: true, command: { createdIds: ['id1'] } });
    expect(writes.commits[0]).toContainEqual(
      expect.objectContaining({ op: 'set', path: 'trees/t1/persons/id1' }),
    );
    expect(writes.commits[0]).toContainEqual(
      expect.objectContaining({
        op: 'update',
        path: 'trees/t1',
        data: expect.objectContaining({ updatedBy: 'u1', rootPersonId: 'id1' }),
      }),
    );
    expect(historyStore.getState().undoStack).toHaveLength(1);

    await act(async () => result.current.undo());
    expect(writes.commits[1]).toContainEqual({ op: 'delete', path: 'trees/t1/persons/id1' });
  });

  it('says so when the server refuses a change', async () => {
    treeStore.getState().open('t1');
    treeStore.getState().applyTree(tree, { fromCache: false, hasPendingWrites: false });
    writes.fail = true;
    const { result } = renderHook(() => useEditor(), { wrapper });
    await act(async () => {
      result.current.run((ctx) => updateTreeSettings(ctx, { showDates: false }));
      await Promise.resolve();
    });
    expect(toastError).toHaveBeenCalledWith(messages.editor.saveFailed);
    expect(historyStore.getState().undoStack).toEqual([]);
  });
});
