import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import bn from '@/../messages/bn.json';
import en from '@/../messages/en.json';
import { EditorProvider } from '@/features/editor/EditorProvider';
import { makePerson } from '@/lib/domain/fixtures/factories';
import { DEFAULT_TREE_SETTINGS } from '@/lib/domain/schemas';
import type { Locale, Person, Tree } from '@/lib/domain/types';
import { historyStore } from '@/stores/historyStore';
import { treeStore } from '@/stores/treeStore';

import { PersonDetailsForm } from './PersonDetailsForm';

const writes = vi.hoisted(() => ({ commits: [] as unknown[][] }));
vi.mock('@/lib/repositories/writes', () => ({
  commitBatch: (ops: unknown[]) => {
    writes.commits.push(ops);
    return Promise.resolve();
  },
  newId: () => 'new-id',
}));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));

const tree: Tree = {
  id: 't1',
  name: 'Karim family',
  ownerId: 'u1',
  memberIds: ['u1'],
  roles: { u1: 'owner' },
  personCount: 1,
  settings: { ...DEFAULT_TREE_SETTINGS },
  createdAt: new Date(0),
  updatedAt: new Date(0),
  updatedBy: 'u1',
  schemaVersion: 1,
};

const person = makePerson('p1', { names: { en: 'Abdul Karim' }, gender: 'male' });

function renderForm(locale: Locale, subject: Person = person) {
  const meta = { fromCache: false, hasPendingWrites: false };
  treeStore.getState().open('t1');
  treeStore.getState().applyTree(tree, meta);
  treeStore.getState().applyPersons([{ type: 'added', id: subject.id, value: subject }], meta);
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === 'bn' ? bn : en}>
      <EditorProvider actorId="u1">
        <PersonDetailsForm person={subject} />
      </EditorProvider>
    </NextIntlClientProvider>,
  );
}

/** Typing, then the autosave pause (PER-05). */
function type(label: string, value: string) {
  fireEvent.change(screen.getByRole('textbox', { name: label }), { target: { value } });
  act(() => vi.advanceTimersByTime(800));
}

beforeEach(() => {
  vi.useFakeTimers();
  // jsdom has no ResizeObserver; the switch measures itself with one.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  writes.commits = [];
  treeStore.getState().close();
  historyStore.getState().clear();
});

describe('PersonDetailsForm (P5-01)', () => {
  it('saves a valid change after a pause, as changed fields only', () => {
    renderForm('en');
    type('Profession', 'Farmer');
    expect(writes.commits).toHaveLength(1);
    expect(writes.commits[0]).toContainEqual(
      expect.objectContaining({
        op: 'update',
        path: 'trees/t1/persons/p1',
        data: expect.objectContaining({ profession: 'Farmer' }),
      }),
    );
  });

  it('shows errors next to the field, in English', () => {
    renderForm('en');
    type('Phone 1', 'call me');
    expect(screen.getByText('Enter a phone number using digits, spaces and + - ( ).')).toBeTruthy();
    type('Email', 'not an email');
    expect(screen.getByText('Please enter a valid email address.')).toBeTruthy();
    expect(writes.commits).toHaveLength(0);
  });

  it('shows the same errors in Bangla, and accepts Bangla digits', () => {
    renderForm('bn');
    type('ফোন ১', 'ফোন করুন');
    expect(screen.getByText(bn.validation.phoneInvalid)).toBeTruthy();
    type('ফোন ১', '০১৭১১ ০০০০০০');
    expect(screen.queryByText(bn.validation.phoneInvalid)).toBeNull();
    expect(writes.commits.at(-1)).toContainEqual(
      expect.objectContaining({ data: expect.objectContaining({ phones: ['01711 000000'] }) }),
    );
  });

  it('asks for a name for an extra detail', () => {
    renderForm('en');
    fireEvent.click(screen.getByRole('button', { name: 'Add a detail' }));
    type('Detail 1', 'B+');
    expect(screen.getByText('Give this field a name.')).toBeTruthy();
    type('Name of detail 1', 'Blood group');
    expect(screen.queryByText('Give this field a name.')).toBeNull();
    expect(writes.commits.at(-1)).toContainEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          customFields: [expect.objectContaining({ label: 'Blood group', value: 'B+' })],
        }),
      }),
    );
  });

  it('counts the description against its limit', () => {
    renderForm('en');
    fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), {
      target: { value: 'Headmaster' },
    });
    expect(screen.getByText('10 / 2,000')).toBeTruthy();
  });
});
