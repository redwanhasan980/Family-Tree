import { describe, expect, it } from 'vitest';

import { makeParentLink, makePerson } from '@/lib/domain/fixtures/factories';
import { testFamily } from '@/lib/domain/fixtures/testFamily';
import { childrenOf, getFamilies, parentsOf } from '@/lib/domain/graph';
import { LIMITS } from '@/lib/domain/schemas';
import { paths } from '@/lib/domain/writes';

import { idSequence, MemoryDb } from './memoryDb';
import {
  addChildren,
  addParent,
  addPerson,
  addSibling,
  addSpouse,
  deletePerson,
  setPersonPhoto,
  updatePerson,
} from './personCommands';
import {
  changeOtherParent,
  linkExisting,
  moveBranch,
  removeRelationship,
  reorderChildren,
  reorderSpouses,
  setParentKind,
  setSpouseStatus,
} from './relationshipCommands';
import { createTree, setRoot, updateTreeDetails, updateTreeSettings } from './treeCommands';

import type { BuildResult, Command, CommandContext } from './types';

function setup({
  root = 'G',
  persons = testFamily().persons,
  links = testFamily().relationships,
} = {}) {
  const db = new MemoryDb();
  db.seedTree('t1', 'u1', persons, links, root);
  const newId = idSequence();
  return { db, ctx: (): CommandContext => db.context('t1', 'u1', newId) };
}

/**
 * Applies the command, undoes it (the data must be exactly as before), then redoes it
 * (the data must match the first result). Leaves the database in the done state.
 */
function roundTrip(db: MemoryDb, result: BuildResult): Command {
  if (!result.ok) throw new Error(`Expected a command, got ${JSON.stringify(result.issues)}`);
  const { command } = result;
  const before = db.content();
  db.apply(command.forward);
  const after = db.content({ ignoreCreated: true });
  db.apply(command.inverse);
  expect(db.content()).toEqual(before);
  db.apply(command.forward);
  expect(db.content({ ignoreCreated: true })).toEqual(after);
  return command;
}

const codes = (result: BuildResult) =>
  (result.ok ? result.warnings : result.issues).map((i) => i.code);
const count = (db: MemoryDb) => db.docs.get(paths.tree('t1'))!.personCount;
const root = (db: MemoryDb) => db.docs.get(paths.tree('t1'))!.rootPersonId;

describe('addChildren (REL-03, REL-04)', () => {
  it('AC REL-04: adds three children in order under the couple; one undo removes all', () => {
    const { db, ctx } = setup();
    const result = addChildren(ctx(), 'S1', [
      { names: { en: 'Karim' }, gender: 'male' },
      { names: { en: 'Rahima' }, gender: 'female' },
      { names: { en: 'Salam' }, gender: 'male' },
    ]);
    const command = roundTrip(db, result);
    expect(command.labelValues).toEqual({ count: 3 });
    const g = ctx().graph;
    // SS was S1's only child; the new ones follow in the typed order, under S1 and SW.
    expect(getFamilies(g, 'S1')).toEqual([
      expect.objectContaining({ partnerId: 'SW', childIds: ['SS', 'n1', 'n2', 'n3'] }),
    ]);
    expect(parentsOf(g, 'n2')).toEqual(['S1', 'SW']);
    expect(count(db)).toBe(19);
  });

  it('uses the first wife by default, a chosen partner, or nobody', () => {
    const { db, ctx } = setup();
    const child = [{ names: { bn: 'নতুন' }, gender: 'unknown' as const }];
    roundTrip(db, addChildren(ctx(), 'G', child));
    expect(parentsOf(ctx().graph, 'n1')).toEqual(['G', 'W1']);
    roundTrip(db, addChildren(ctx(), 'G', child, { otherParentId: 'W2' }));
    expect(parentsOf(ctx().graph, 'n2')).toEqual(['G', 'W2']);
    roundTrip(db, addChildren(ctx(), 'G', child, { otherParentId: null }));
    expect(parentsOf(ctx().graph, 'n3')).toEqual(['G']);
    roundTrip(db, addChildren(ctx(), 'X', child));
    expect(parentsOf(ctx().graph, 'n4')).toEqual(['X']); // P is a co-parent, not a wife
  });

  it('refuses bad input and warns about likely duplicates', () => {
    const { ctx } = setup();
    expect(codes(addChildren(ctx(), 'ghost', [{ names: { en: 'A' }, gender: 'male' }]))).toEqual([
      'missingPerson',
    ]);
    expect(codes(addChildren(ctx(), 'G', []))).toEqual(['childrenCount']);
    expect(codes(addChildren(ctx(), 'G', [{ names: {}, gender: 'male' }]))).toEqual([
      'nameRequired',
    ]);
    expect(
      codes(
        addChildren(ctx(), 'G', [{ names: { en: 'A' }, gender: 'male' }], { otherParentId: 'H' }),
      ),
    ).toEqual(['notAPartner']);
    expect(codes(addChildren(ctx(), 'G', [{ names: { en: 's1' }, gender: 'male' }]))).toEqual([
      'possibleDuplicate',
    ]);
  });

  it('refuses two biological parents of the same gender', () => {
    const { ctx } = setup({
      persons: [makePerson('a', { gender: 'female' }), makePerson('b', { gender: 'female' })],
      links: [],
      root: 'a',
    });
    const linked = linkExisting(ctx(), { type: 'spouse', personId: 'a', partnerId: 'b' });
    const db2 = setup({
      persons: [makePerson('a', { gender: 'female' }), makePerson('b', { gender: 'female' })],
      links: [],
      root: 'a',
    });
    roundTrip(db2.db, linked);
    expect(codes(addChildren(db2.ctx(), 'a', [{ names: { en: 'k' }, gender: 'male' }]))).toEqual([
      'tooManyBiologicalParents',
    ]);
  });
});

describe('adding people', () => {
  it('makes the first person the root', () => {
    const { db, ctx } = setup({ persons: [], links: [], root: '' });
    roundTrip(db, addPerson(ctx(), { names: { bn: 'আব্দুল করিম' }, gender: 'male' }));
    expect(root(db)).toBe('n1');
    roundTrip(db, addPerson(ctx(), { names: { en: 'Someone' }, gender: 'female' }));
    expect(root(db)).toBe('n1');
    expect(count(db)).toBe(2);
    expect(codes(addPerson(ctx(), { names: { en: '' }, gender: 'male' }))).toEqual([
      'nameRequired',
    ]);
  });

  it('respects the person limits', () => {
    const { db, ctx } = setup();
    db.docs.get(paths.tree('t1'))!.personCount = LIMITS.personsHardLimit;
    expect(codes(addPerson(ctx(), { names: { en: 'A' }, gender: 'male' }))).toEqual(['treeFull']);
    db.docs.get(paths.tree('t1'))!.personCount = LIMITS.personsSoftLimit;
    const result = addPerson(ctx(), { names: { en: 'A' }, gender: 'male' });
    expect(result.ok && result.warnings.map((w) => w.code)).toEqual(['treeLarge']);
  });

  it('adds a spouse after existing marriages', () => {
    const { db, ctx } = setup();
    roundTrip(
      db,
      addSpouse(
        ctx(),
        'G',
        { names: { en: 'Third wife' }, gender: 'female' },
        { status: 'widowed' },
      ),
    );
    const link = ctx().graph.links.get('s_G_n1');
    expect(link).toMatchObject({ type: 'spouse', status: 'widowed', sequence: 3 });
    expect(getFamilies(ctx().graph, 'G').map((f) => f.partnerId)).toEqual(['W1', 'W2', 'n1', null]);
    // A first marriage is number 1.
    roundTrip(db, addSpouse(ctx(), 'A', { names: { en: 'Wife' }, gender: 'female' }));
    expect(ctx().graph.links.get('s_A_n2')).toMatchObject({ sequence: 1 });
    expect(codes(addSpouse(ctx(), 'ghost', { names: { en: 'x' }, gender: 'male' }))).toEqual([
      'missingPerson',
    ]);
  });

  it('adds a parent, marries them to the existing parent, and moves the root up', () => {
    const { db, ctx } = setup();
    roundTrip(db, addParent(ctx(), 'G', { names: { en: 'Great-grandfather' }, gender: 'male' }));
    expect(root(db)).toBe('n1');
    roundTrip(db, addParent(ctx(), 'G', { names: { en: 'Great-grandmother' }, gender: 'female' }));
    expect(ctx().graph.links.has('s_n1_n2')).toBe(true);
    expect(root(db)).toBe('n1');
    expect(codes(addParent(ctx(), 'G', { names: { en: 'Third' }, gender: 'male' }))).toEqual([
      'tooManyBiologicalParents',
    ]);
    // A stepfather is fine and doesn't marry anyone automatically.
    roundTrip(
      db,
      addParent(ctx(), 'G', { names: { en: 'Step' }, gender: 'male' }, { kind: 'step' }),
    );
    expect([...ctx().graph.links.keys()].filter((id) => id.includes('n3'))).toEqual(['p_n3_G']);
  });

  it('adds a sibling under the same parents, last in order', () => {
    const { db, ctx } = setup();
    roundTrip(db, addSibling(ctx(), 'S2', { names: { en: 'New sibling' }, gender: 'female' }));
    expect(parentsOf(ctx().graph, 'n1')).toEqual(['G', 'W2']);
    expect(childrenOf(ctx().graph, 'G').at(-1)).toBe('n1');
    expect(codes(addSibling(ctx(), 'G', { names: { en: 'x' }, gender: 'male' }))).toEqual([
      'noParents',
    ]);
    expect(codes(addSibling(ctx(), 'S2', { names: { en: 's1' }, gender: 'male' }))).toEqual([
      'possibleDuplicate',
    ]);
  });
});

describe('updatePerson (PER-05)', () => {
  it('writes only changed fields, by field path, and undoes them', () => {
    const { db, ctx } = setup();
    const command = roundTrip(
      db,
      updatePerson(ctx(), 'G', {
        names: { en: 'G', bn: 'জি' },
        profession: 'কৃষক',
        birth: { date: { year: 1926, approximate: true } },
      }),
    );
    expect(
      Object.keys(command.forward[0]!.op === 'update' ? command.forward[0]!.data : {}).sort(),
    ).toEqual(['birth', 'names.bn', 'profession', 'updatedAt', 'updatedBy']);
    expect(command.coalesceKey).toBe('person:G');
    // Clearing a field deletes it; undo brings it back.
    roundTrip(db, updatePerson(ctx(), 'G', { profession: undefined, names: { bn: 'জি' } }));
    expect(ctx().graph.persons.get('G')).not.toHaveProperty('profession');
    expect(ctx().graph.persons.get('G')!.names).toEqual({ bn: 'জি' });
  });

  it('refuses invalid details and reports when nothing changed', () => {
    const { ctx } = setup();
    expect(codes(updatePerson(ctx(), 'G', { names: {} }))).toEqual(['nameRequired']);
    expect(codes(updatePerson(ctx(), 'G', { nickname: 'n'.repeat(61) }))).toEqual([
      'nicknameTooLong',
    ]);
    expect(codes(updatePerson(ctx(), 'G', { gender: 'male' }))).toEqual(['noChanges']);
    expect(codes(updatePerson(ctx(), 'ghost', {}))).toEqual(['missingPerson']);
  });
});

describe('setPersonPhoto (MED-05)', () => {
  const photo = (suffix: string, personId = 'G', treeId = 't1') => ({
    publicId: `shikor/test/${treeId}/${personId}/${suffix}`,
    version: 3,
    width: 800,
    height: 800,
  });

  it('adds, replaces and removes a photo, each as its own undo step', () => {
    const { db, ctx } = setup();
    const added = roundTrip(db, setPersonPhoto(ctx(), 'G', photo('first0001')));
    expect(added.labelKey).toBe('addPhoto');
    expect(added.coalesceKey).toBeUndefined();
    expect(db.docs.get(paths.person('t1', 'G'))!.photo).toEqual(photo('first0001'));
    expect(roundTrip(db, setPersonPhoto(ctx(), 'G', photo('second001'))).labelKey).toBe(
      'replacePhoto',
    );
    expect(roundTrip(db, setPersonPhoto(ctx(), 'G', null)).labelKey).toBe('removePhoto');
    expect(db.docs.get(paths.person('t1', 'G'))!.photo).toBeUndefined();
  });

  it('only takes photos stored for this person in this tree', () => {
    const { ctx } = setup();
    expect(codes(setPersonPhoto(ctx(), 'G', photo('other0001', 'S1')))).toEqual(['invalidPhoto']);
    expect(codes(setPersonPhoto(ctx(), 'G', photo('other0001', 'G', 't2')))).toEqual([
      'invalidPhoto',
    ]);
    expect(codes(setPersonPhoto(ctx(), 'G', { ...photo('bad0001'), version: 0 }))).toEqual([
      'invalidPhoto',
    ]);
    expect(codes(setPersonPhoto(ctx(), 'missing', photo('x0000001')))).toEqual(['missingPerson']);
    expect(codes(setPersonPhoto(ctx(), 'G', null))).toEqual(['noChanges']);
  });
});

describe('deletePerson (PER-06)', () => {
  it('removes only the person and their relationships; undo restores them exactly', () => {
    const { db, ctx } = setup();
    roundTrip(db, deletePerson(ctx(), 'D1'));
    const g = ctx().graph;
    expect(g.persons.has('D1')).toBe(false);
    expect(g.persons.has('DD')).toBe(true);
    expect([...g.links.keys()].some((id) => id.includes('D1'))).toBe(false);
    expect(count(db)).toBe(15);
  });

  it('removes descendants too, and hands the root to the first child when needed', () => {
    const { db, ctx } = setup();
    const command = roundTrip(db, deletePerson(ctx(), 'S1', { withDescendants: true }));
    expect(command.labelValues).toEqual({ count: 3 }); // S1, SS, K
    expect(ctx().graph.persons.has('K')).toBe(false);
    expect(ctx().graph.persons.has('SW')).toBe(true); // married-in spouse stays

    const second = setup();
    roundTrip(second.db, deletePerson(second.ctx(), 'G'));
    expect(root(second.db)).toBe('S1');
    const third = setup();
    roundTrip(third.db, deletePerson(third.ctx(), 'G', { withDescendants: true }));
    expect(root(third.db)).toBeUndefined();
    expect(codes(deletePerson(third.ctx(), 'ghost'))).toEqual(['missingPerson']);
  });

  it('refuses a deletion too large for one undoable step', () => {
    const children = Array.from({ length: 460 }, (_, i) => makePerson(`c${i}`));
    const { ctx } = setup({
      persons: [makePerson('top'), ...children],
      links: children.map((c) => makeParentLink('top', c.id)),
      root: 'top',
    });
    expect(codes(deletePerson(ctx(), 'top', { withDescendants: true }))).toEqual([
      'tooLargeToDelete',
    ]);
    expect(ctx().graph.persons.size).toBe(461);
  });
});

describe('relationship commands', () => {
  it('AC REL-10: blocks making a grandson someone’s father', () => {
    const { ctx } = setup();
    expect(codes(linkExisting(ctx(), { type: 'parent', parentId: 'SS', childId: 'G' }))).toEqual([
      'cycle',
    ]);
  });

  it('links existing people as parent or spouse (REL-06)', () => {
    const { db, ctx } = setup();
    roundTrip(
      db,
      linkExisting(ctx(), { type: 'parent', parentId: 'O', childId: 'A', kind: 'adoptive' }),
    );
    expect(ctx().graph.links.get('p_O_A')).toMatchObject({ kind: 'adoptive' });
    roundTrip(
      db,
      linkExisting(ctx(), { type: 'spouse', personId: 'X', partnerId: 'P', status: 'separated' }),
    );
    expect(ctx().graph.links.get('s_P_X')).toMatchObject({ status: 'separated', sequence: 1 });
    expect(codes(linkExisting(ctx(), { type: 'spouse', personId: 'G', partnerId: 'S1' }))).toEqual([
      'spouseParentConflict',
    ]);
    const warned = linkExisting(ctx(), {
      type: 'parent',
      parentId: 'K',
      childId: 'O',
      kind: 'step',
    });
    expect(warned.ok && warned.warnings).toEqual([]);
  });

  it('changes a link’s kind, checking the biological limit', () => {
    const { db, ctx } = setup();
    roundTrip(db, setParentKind(ctx(), 'p_G_S1', 'adoptive'));
    expect(ctx().graph.links.get('p_G_S1')).toMatchObject({ kind: 'adoptive' });
    roundTrip(db, setParentKind(ctx(), 'p_G_S1', 'biological'));
    roundTrip(
      db,
      linkExisting(ctx(), { type: 'parent', parentId: 'H', childId: 'S1', kind: 'step' }),
    );
    expect(codes(setParentKind(ctx(), 'p_H_S1', 'biological'))).toEqual([
      'tooManyBiologicalParents',
    ]);
    expect(codes(setParentKind(ctx(), 'p_G_S1', 'biological'))).toEqual(['noChanges']);
    expect(codes(setParentKind(ctx(), 's_G_W1', 'step'))).toEqual(['missingRelationship']);
  });

  it('edits marriage status, date and order', () => {
    const { db, ctx } = setup();
    roundTrip(
      db,
      setSpouseStatus(ctx(), 's_G_W1', {
        status: 'widowed',
        marriageDate: { year: 1950, month: 2 },
      }),
    );
    expect(ctx().graph.links.get('s_G_W1')).toMatchObject({
      status: 'widowed',
      marriageDate: { year: 1950, month: 2 },
    });
    roundTrip(db, setSpouseStatus(ctx(), 's_G_W1', { marriageDate: null, sequence: null }));
    expect(ctx().graph.links.get('s_G_W1')).not.toHaveProperty('marriageDate');
    expect(ctx().graph.links.get('s_G_W1')).not.toHaveProperty('sequence');
    expect(codes(setSpouseStatus(ctx(), 's_G_W1', { status: 'widowed' }))).toEqual(['noChanges']);
    expect(
      codes(setSpouseStatus(ctx(), 's_G_W1', { marriageDate: { year: 1950, month: 2, day: 30 } })),
    ).toEqual(['dayInvalid']);
    expect(codes(setSpouseStatus(ctx(), 's_G_W1', { sequence: 0 }))).toEqual(['invalid']);
    expect(codes(setSpouseStatus(ctx(), 'p_G_S1', {}))).toEqual(['missingRelationship']);
  });

  it('changes which mother a child has (REL-07)', () => {
    const { db, ctx } = setup();
    roundTrip(db, changeOtherParent(ctx(), 'S1', 'W1', 'W2'));
    expect(parentsOf(ctx().graph, 'S1')).toEqual(['G', 'W2']);
    roundTrip(db, changeOtherParent(ctx(), 'X', null, 'W1'));
    expect(parentsOf(ctx().graph, 'X')).toEqual(['G', 'W1']);
    roundTrip(db, changeOtherParent(ctx(), 'X', 'W1', null));
    expect(codes(changeOtherParent(ctx(), 'X', 'W1', null))).toEqual(['missingRelationship']);
    expect(codes(changeOtherParent(ctx(), 'S1', 'W2', 'W2'))).toEqual(['noChanges']);
    expect(codes(changeOtherParent(ctx(), 'S1', 'W2', 'K'))).toEqual(['cycle']);
  });

  it('moves a branch under another parent (REL-08)', () => {
    const { db, ctx } = setup();
    roundTrip(db, moveBranch(ctx(), 'X', 'S2'));
    expect(parentsOf(ctx().graph, 'X')).toEqual(['S2']);
    expect(childrenOf(ctx().graph, 'X')).toEqual(['Y']); // descendants come along
    roundTrip(db, moveBranch(ctx(), 'X', 'G', { otherParentId: 'W2' }));
    expect(parentsOf(ctx().graph, 'X')).toEqual(['G', 'W2']);
    expect(codes(moveBranch(ctx(), 'G', 'K'))).toEqual(['cycle']);
    expect(codes(moveBranch(ctx(), 'X', 'X'))).toEqual(['selfRelationship']);
    expect(codes(moveBranch(ctx(), 'X', 'G', { otherParentId: 'W2' }))).toEqual(['noChanges']);
    expect(codes(moveBranch(ctx(), 'X', 'G', { otherParentId: 'H' }))).toEqual(['notAPartner']);
  });

  it('reorders one family’s children in place (REL-07)', () => {
    const { db, ctx } = setup();
    roundTrip(db, reorderChildren(ctx(), 'G', ['D1', 'S1']));
    expect(childrenOf(ctx().graph, 'G')).toEqual(['D1', 'S1', 'S2', 'X']);
    expect(childrenOf(ctx().graph, 'W1')).toEqual(['D1', 'S1']);
    roundTrip(db, reorderChildren(ctx(), 'G', ['X', 'D1', 'S1', 'S2']));
    expect(childrenOf(ctx().graph, 'G')).toEqual(['X', 'D1', 'S1', 'S2']);
    expect(codes(reorderChildren(ctx(), 'G', ['X', 'D1', 'S1', 'S2']))).toEqual(['noChanges']);
    expect(codes(reorderChildren(ctx(), 'G', ['X', 'X']))).toEqual(['invalidOrder']);
    expect(codes(reorderChildren(ctx(), 'G', ['K']))).toEqual(['invalidOrder']);
  });

  it('reorders someone’s marriages (REL-07)', () => {
    const { db, ctx } = setup();
    const order = () => getFamilies(ctx().graph, 'G').map((f) => f.partnerId);
    expect(order()).toEqual(['W1', 'W2', null]);
    roundTrip(db, reorderSpouses(ctx(), 'G', ['s_G_W2', 's_G_W1']));
    expect(order()).toEqual(['W2', 'W1', null]);
    expect(codes(reorderSpouses(ctx(), 'G', ['s_G_W2', 's_G_W1']))).toEqual(['noChanges']);
    expect(codes(reorderSpouses(ctx(), 'G', ['s_G_W2']))).toEqual(['invalidOrder']);
    expect(codes(reorderSpouses(ctx(), 'G', ['s_G_W2', 's_G_W2']))).toEqual(['invalidOrder']);
    expect(codes(reorderSpouses(ctx(), 'nobody', []))).toEqual(['missingPerson']);
  });

  it('removes a relationship but keeps the people (REL-09)', () => {
    const { db, ctx } = setup();
    roundTrip(db, removeRelationship(ctx(), 's_DD_SS'));
    expect(ctx().graph.links.has('s_DD_SS')).toBe(false);
    expect(ctx().graph.persons.has('DD')).toBe(true);
    expect(codes(removeRelationship(ctx(), 's_DD_SS'))).toEqual(['missingRelationship']);
  });
});

describe('tree commands', () => {
  it('sets the root (TREE-05)', () => {
    const { db, ctx } = setup();
    roundTrip(db, setRoot(ctx(), 'S1'));
    expect(root(db)).toBe('S1');
    expect(codes(setRoot(ctx(), 'S1'))).toEqual(['noChanges']);
    expect(codes(setRoot(ctx(), 'ghost'))).toEqual(['missingPerson']);
    const empty = setup({ root: '' });
    roundTrip(empty.db, setRoot(empty.ctx(), 'G'));
    expect(root(empty.db)).toBe('G');
  });

  it('renames a tree and edits its description (TREE-03)', () => {
    const { db, ctx } = setup();
    roundTrip(
      db,
      updateTreeDetails(ctx(), { name: ' করিম পরিবার ', description: 'আমাদের পরিবার' }),
    );
    expect(ctx().tree).toMatchObject({ name: 'করিম পরিবার', description: 'আমাদের পরিবার' });
    roundTrip(db, updateTreeDetails(ctx(), { description: '' }));
    expect(ctx().tree).not.toHaveProperty('description');
    expect(codes(updateTreeDetails(ctx(), { name: 'করিম পরিবার' }))).toEqual(['noChanges']);
    expect(codes(updateTreeDetails(ctx(), { name: '' }))).toEqual(['treeNameRequired']);
  });

  it('changes display settings field by field (TREE-06)', () => {
    const { db, ctx } = setup();
    const command = roundTrip(
      db,
      updateTreeSettings(ctx(), { colorBy: 'gender', showDates: false }),
    );
    const data = command.forward[0]!.op === 'update' ? command.forward[0]!.data : {};
    expect(
      Object.keys(data)
        .filter((k) => k.startsWith('settings.'))
        .sort(),
    ).toEqual(['settings.colorBy', 'settings.showDates']);
    expect(ctx().tree.settings).toMatchObject({
      colorBy: 'gender',
      showDates: false,
      nameDisplay: 'auto',
    });
    expect(codes(updateTreeSettings(ctx(), { colorBy: 'gender' }))).toEqual(['noChanges']);
    expect(updateTreeSettings(ctx(), { colorBy: 'rainbow' as never }).ok).toBe(false);
  });

  it('creates a tree with its first person in one batch (TREE-01)', () => {
    const db = new MemoryDb();
    const result = createTree(
      {
        name: ' করিম পরিবার ',
        description: '',
        root: { names: { bn: 'আব্দুল করিম' }, gender: 'male' },
      },
      { actorId: 'u1', newId: idSequence('t') },
    );
    expect(result.treeId).toBe('t1');
    const command = roundTrip(db, result);
    expect(command.createdIds).toEqual(['t2']);
    const ctx = db.context('t1', 'u1', idSequence());
    expect(ctx.tree).toMatchObject({
      name: 'করিম পরিবার',
      ownerId: 'u1',
      roles: { u1: 'owner' },
      rootPersonId: 't2',
      personCount: 1,
    });
    expect(ctx.tree).not.toHaveProperty('description');
    expect(ctx.graph.persons.get('t2')!.names).toEqual({ bn: 'আব্দুল করিম' });
    expect(codes(createTree({ name: '' }, { actorId: 'u1', newId: idSequence() }))).toEqual([
      'treeNameRequired',
    ]);
    expect(
      codes(
        createTree(
          { name: 'x', root: { names: {}, gender: 'male' } },
          { actorId: 'u1', newId: idSequence() },
        ),
      ),
    ).toEqual(['nameRequired']);
    const bare = createTree({ name: 'Empty' }, { actorId: 'u1', newId: idSequence('e') });
    expect(bare.ok && bare.command.forward).toHaveLength(1);
  });
});
