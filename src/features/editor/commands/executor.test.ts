import { describe, expect, it, vi } from 'vitest';

import { testFamily } from '@/lib/domain/fixtures/testFamily';
import type { WriteOp } from '@/lib/domain/writes';
import { COALESCE_MS, createHistoryStore, HISTORY_LIMIT } from '@/stores/historyStore';

import { canCoalesce, coalesce } from './coalesce';
import { createExecutor } from './executor';
import { idSequence, MemoryDb } from './memoryDb';
import { addChildren, updatePerson } from './personCommands';

import type { Command } from './types';

function setup() {
  const db = new MemoryDb();
  const { persons, relationships } = testFamily();
  db.seedTree('t1', 'u1', persons, relationships, 'G');
  const newId = idSequence();
  const ctx = () => db.context('t1', 'u1', newId);
  const history = createHistoryStore();
  let clock = 1_000;
  const commit = vi.fn((ops: readonly WriteOp[]) => {
    db.apply(ops);
    return Promise.resolve();
  });
  const executor = createExecutor({ commit, history, now: () => clock });
  return { db, ctx, history, executor, commit, advance: (ms: number) => (clock += ms) };
}

const build = (result: ReturnType<typeof updatePerson>): Command => {
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.command;
};

describe('executor', () => {
  it('runs, undoes and redoes commands (UX-01)', async () => {
    const { db, ctx, history, executor } = setup();
    const before = db.content();
    await executor.run(build(addChildren(ctx(), 'G', [{ names: { en: 'New' }, gender: 'male' }])));
    const after = db.content({ ignoreCreated: true });
    expect(history.getState().undoStack).toHaveLength(1);

    expect(await executor.undo()).toBe(true);
    expect(db.content()).toEqual(before);
    expect(history.getState().redoStack).toHaveLength(1);

    expect(await executor.redo()).toBe(true);
    expect(db.content({ ignoreCreated: true })).toEqual(after);
    expect(await executor.redo()).toBe(false);

    await executor.undo();
    expect(await executor.undo()).toBe(false);
  });

  it('merges quick edits of the same person into one undo step', async () => {
    const { db, ctx, history, executor, advance } = setup();
    const before = db.content();
    await executor.run(build(updatePerson(ctx(), 'G', { nickname: 'করিম' })));
    advance(COALESCE_MS - 1);
    await executor.run(
      build(updatePerson(ctx(), 'G', { nickname: 'করিম মিয়া', profession: 'কৃষক' })),
    );
    expect(history.getState().undoStack).toHaveLength(1);
    expect(ctx().graph.persons.get('G')).toMatchObject({
      nickname: 'করিম মিয়া',
      profession: 'কৃষক',
    });

    await executor.undo();
    expect(db.content()).toEqual(before);

    // Too far apart, or a different person: separate steps.
    await executor.run(build(updatePerson(ctx(), 'G', { nickname: 'a' })));
    advance(COALESCE_MS + 1);
    await executor.run(build(updatePerson(ctx(), 'G', { nickname: 'b' })));
    await executor.run(build(updatePerson(ctx(), 'S1', { nickname: 'c' })));
    expect(history.getState().undoStack).toHaveLength(3);
  });

  it('drops a command the server refused', async () => {
    const history = createHistoryStore();
    const onError = vi.fn();
    const failing = createExecutor({
      commit: () => Promise.reject(new Error('permission-denied')),
      history,
      onError,
    });
    const command: Command = { id: 'c1', labelKey: 'x', forward: [], inverse: [], touched: [] };
    await failing.run(command);
    expect(history.getState().undoStack).toEqual([]);
    expect(onError).toHaveBeenCalledWith(expect.any(Error), command);
  });

  it('asks before undoing when told to, and keeps the step if refused', async () => {
    const history = createHistoryStore();
    const commit = vi.fn(() => Promise.resolve());
    const confirmUndo = vi.fn(() => Promise.resolve(false));
    const executor = createExecutor({ commit, history, confirmUndo });
    await executor.run({
      id: 'c1',
      labelKey: 'x',
      forward: [],
      inverse: [],
      touched: ['trees/t1'],
    });
    expect(await executor.undo()).toBe(false);
    expect(history.getState().undoStack).toHaveLength(1);
    expect(commit).toHaveBeenCalledTimes(1);
  });
});

describe('history store', () => {
  const command = (id: string, extra: Partial<Command> = {}): Command => ({
    id,
    labelKey: 'x',
    forward: [],
    inverse: [],
    touched: [],
    ...extra,
  });

  it('keeps a bounded history and clears redo on new work', () => {
    const history = createHistoryStore();
    for (let i = 0; i < HISTORY_LIMIT + 5; i++)
      history.getState().record(command(`c${i}`), i * 10_000);
    expect(history.getState().undoStack).toHaveLength(HISTORY_LIMIT);
    expect(history.getState().undoStack[0]!.command.id).toBe('c5');
    history.getState().pushRedo(command('r'));
    history.getState().record(command('new'), 0);
    expect(history.getState().redoStack).toEqual([]);
    history.getState().clear();
    expect(history.getState().undoStack).toEqual([]);
  });

  it('discards a command wherever it is', () => {
    const history = createHistoryStore();
    history.getState().record(command('a'), 0);
    history.getState().pushRedo(command('b'));
    history.getState().discard('a');
    history.getState().discard('b');
    expect(history.getState().undoStack).toEqual([]);
    expect(history.getState().redoStack).toEqual([]);
  });
});

describe('coalesce', () => {
  const edit = (
    id: string,
    key: string | undefined,
    forward: Record<string, unknown>,
    inverse: Record<string, unknown>,
    path = 'p/1',
  ): Command => ({
    id,
    labelKey: 'updatePerson',
    forward: [{ op: 'update', path, data: forward }],
    inverse: [{ op: 'update', path, data: inverse }],
    touched: [path],
    ...(key && { coalesceKey: key }),
  });

  it('keeps the latest values forward and the first originals for undo', () => {
    const merged = coalesce(
      edit('a', 'k', { x: 1 }, { x: 0 }),
      edit('b', 'k', { x: 2, y: 5 }, { x: 1, y: 4 }),
    );
    expect(merged.id).toBe('a');
    expect(merged.forward[0]).toEqual({ op: 'update', path: 'p/1', data: { x: 2, y: 5 } });
    expect(merged.inverse[0]).toEqual({ op: 'update', path: 'p/1', data: { x: 0, y: 4 } });
  });

  it('only merges single updates with the same key and document', () => {
    expect(canCoalesce(edit('a', 'k', {}, {}), edit('b', 'k', {}, {}))).toBe(true);
    expect(canCoalesce(edit('a', undefined, {}, {}), edit('b', undefined, {}, {}))).toBe(false);
    expect(canCoalesce(edit('a', 'k', {}, {}), edit('b', 'j', {}, {}))).toBe(false);
    expect(canCoalesce(edit('a', 'k', {}, {}), edit('b', 'k', {}, {}, 'p/2'))).toBe(false);
    expect(canCoalesce(edit('a', 'k', {}, {}), { ...edit('b', 'k', {}, {}), forward: [] })).toBe(
      false,
    );
  });
});
