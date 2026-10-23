import { act, renderHook } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

import messages from '@/../messages/en.json';
import { makeParentLink, makePerson } from '@/lib/domain/fixtures/factories';
import { DEFAULT_TREE_SETTINGS } from '@/lib/domain/schemas';
import type { Tree } from '@/lib/domain/types';
import { historyStore } from '@/stores/historyStore';
import { treeStore } from '@/stores/treeStore';

import { addChildren, addPerson, updateTreeSettings } from './commands';
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

  it('can hold back a command with warnings until confirmed', () => {
    treeStore.getState().open('t1');
    const meta = { fromCache: false, hasPendingWrites: false };
    treeStore.getState().applyTree({ ...tree, personCount: 2, rootPersonId: 'p1' }, meta);
    treeStore.getState().applyPersons(
      [
        { type: 'added', id: 'p1', value: makePerson('p1', { names: { en: 'Karim' } }) },
        { type: 'added', id: 'c1', value: makePerson('c1', { names: { en: 'Rahim' } }) },
      ],
      meta,
    );
    const link = makeParentLink('p1', 'c1');
    treeStore.getState().applyRelationships([{ type: 'added', id: link.id, value: link }], meta);
    const { result } = renderHook(() => useEditor(), { wrapper });
    const another = [{ names: { en: 'Rahim' }, gender: 'male' as const }];

    // A second Rahim among the children may be a duplicate: held back until confirmed.
    const held = result.current.run((ctx) => addChildren(ctx, 'p1', another), {
      allowWarnings: false,
    });
    expect(held).toMatchObject({ ok: true, warnings: [{ code: 'possibleDuplicate' }] });
    expect(writes.commits).toHaveLength(0);
    result.current.run((ctx) => addChildren(ctx, 'p1', another));
    expect(writes.commits).toHaveLength(1);
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
