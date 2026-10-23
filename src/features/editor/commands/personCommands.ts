import {
  childLinksOf,
  childrenOf,
  compareSpouseLinks,
  descendantIds,
  findDuplicates,
  nextSiblingKey,
  parentLinksOf,
  partnersOf,
  siblingsOf,
  spouseLinksOf,
  type FamilyGraph,
} from '@/lib/domain/graph';
import { parentLinkId, spouseLinkId, spousePair } from '@/lib/domain/ids';
import { parsePhotoId } from '@/lib/domain/media';
import {
  LIMITS,
  NewPersonSchema,
  PersonDetailsSchema,
  PhotoRefSchema,
  type NewPersonInput,
} from '@/lib/domain/schemas';
import type {
  ID,
  Issue,
  ParentKind,
  ParentLink,
  Person,
  PersonDetails,
  PhotoRef,
  Relationship,
  SpouseLink,
  SpouseStatus,
} from '@/lib/domain/types';
import { DELETE_FIELD, MAX_BATCH_OPS, type WriteData } from '@/lib/domain/writes';

import {
  commandId,
  createLink,
  createPerson,
  fail,
  failWith,
  ok,
  personPath,
  remove,
  restoreLink,
  restorePerson,
  touchedPaths,
  touchTree,
  update,
  linkPath,
  zodIssues,
} from './build';

import type { BuildResult, CommandContext } from './types';

// ---------- shared helpers ----------

function parsePeople(
  inputs: readonly NewPersonInput[],
): { ok: true; people: PersonDetails[] } | { ok: false; issues: Issue[] } {
  const people: PersonDetails[] = [];
  const issues: Issue[] = [];
  inputs.forEach((input, index) => {
    const parsed = NewPersonSchema.safeParse(input);
    if (parsed.success) people.push(parsed.data);
    else
      issues.push(
        ...zodIssues(parsed.error).map((i) => ({ ...i, params: { ...i.params, index } })),
      );
  });
  return issues.length > 0 ? { ok: false, issues } : { ok: true, people };
}

/** Errors above the hard limit; a warning when crossing the soft limit (SRS §6.2). */
function capacity(ctx: CommandContext, adding: number): Issue[] {
  const after = ctx.tree.personCount + adding;
  if (after > LIMITS.personsHardLimit) {
    return [{ severity: 'error', code: 'treeFull', params: { limit: LIMITS.personsHardLimit } }];
  }
  if (after > LIMITS.personsSoftLimit && ctx.tree.personCount <= LIMITS.personsSoftLimit) {
    return [{ severity: 'warning', code: 'treeLarge', params: { limit: LIMITS.personsSoftLimit } }];
  }
  return [];
}

export const errorsIn = (issues: readonly Issue[]) => issues.filter((i) => i.severity === 'error');
export const warningsIn = (issues: readonly Issue[]) =>
  issues.filter((i) => i.severity === 'warning');

export function parentLink(parentId: ID, childId: ID, kind: ParentKind): ParentLink {
  // Stamps are written by createLink; the domain object only carries the fields.
  return {
    id: parentLinkId(parentId, childId),
    type: 'parent',
    parentId,
    childId,
    kind,
  } as ParentLink;
}

export function spouseLink(a: ID, b: ID, status: SpouseStatus, sequence?: number): SpouseLink {
  return {
    id: spouseLinkId(a, b),
    type: 'spouse',
    personIds: spousePair(a, b),
    status,
    ...(sequence !== undefined && { sequence }),
  } as SpouseLink;
}

/**
 * Marriage order for a new marriage of `personId`: after all existing ones. When an
 * existing marriage has no number, creation time already puts the new one last.
 */
export function nextMarriageSequence(g: FamilyGraph, personId: ID): number | undefined {
  const links = spouseLinksOf(g, personId);
  if (links.some((l) => l.sequence === undefined)) return links.length === 0 ? 1 : undefined;
  return Math.max(0, ...links.map((l) => l.sequence ?? 0)) + 1;
}

/**
 * The other parent for new children of `parentId` (REL-03): an explicit choice (null =
 * nobody) must be a partner; otherwise the first spouse in marriage order, if any.
 */
export function resolveOtherParent(
  g: FamilyGraph,
  parentId: ID,
  requested: ID | null | undefined,
): { ok: true; id: ID | null } | { ok: false } {
  if (requested === null) return { ok: true, id: null };
  if (requested !== undefined) {
    return partnersOf(g, parentId).includes(requested)
      ? { ok: true, id: requested }
      : { ok: false };
  }
  const first = [...spouseLinksOf(g, parentId)].sort(compareSpouseLinks)[0];
  return {
    ok: true,
    id: first ? (first.personIds[0] === parentId ? first.personIds[1] : first.personIds[0]) : null,
  };
}

function duplicateWarnings(
  g: FamilyGraph,
  people: readonly PersonDetails[],
  near: readonly ID[],
): Issue[] {
  return people.flatMap((p) =>
    findDuplicates(g, p.names, near).map((personId) => ({
      severity: 'warning' as const,
      code: 'possibleDuplicate',
      params: { personId, name: p.names.en || p.names.bn || '' },
    })),
  );
}

// ---------- commands ----------

/** Adds a person with no relatives yet. The first person becomes the root (TREE-05). */
export function addPerson(ctx: CommandContext, input: NewPersonInput): BuildResult {
  const parsed = parsePeople([input]);
  if (!parsed.ok) return failWith(parsed.issues);
  const limits = capacity(ctx, 1);
  if (errorsIn(limits).length > 0) return failWith(limits);

  const id = ctx.newId();
  const { rootPersonId } = ctx.tree;
  const setsRoot = !rootPersonId || !ctx.graph.persons.has(rootPersonId);
  const forward = [
    createPerson(ctx, id, parsed.people[0]!),
    touchTree(ctx, 1, setsRoot ? { rootPersonId: id } : {}),
  ];
  const inverse = [
    remove(personPath(ctx, id)),
    touchTree(ctx, -1, setsRoot ? { rootPersonId: rootPersonId ?? DELETE_FIELD } : {}),
  ];
  return ok(
    {
      id: commandId(),
      labelKey: 'addPerson',
      forward,
      inverse,
      touched: touchedPaths(forward),
      createdIds: [id],
    },
    limits,
  );
}

export interface AddChildrenOptions {
  /** The other parent: undefined = automatic (REL-03), null = nobody. */
  otherParentId?: ID | null;
}

/**
 * Adds one or more children in the given order, linked to the parent and the other parent
 * (REL-03, REL-04). One undo removes them all.
 */
export function addChildren(
  ctx: CommandContext,
  parentId: ID,
  inputs: readonly NewPersonInput[],
  { otherParentId }: AddChildrenOptions = {},
): BuildResult {
  const g = ctx.graph;
  const parent = g.persons.get(parentId);
  if (!parent) return fail('missingPerson');
  if (inputs.length === 0 || inputs.length > 50) return fail('childrenCount', { max: 50 });
  const parsed = parsePeople(inputs);
  if (!parsed.ok) return failWith(parsed.issues);
  const other = resolveOtherParent(g, parentId, otherParentId);
  if (!other.ok) return fail('notAPartner');
  const otherParent = other.id ? g.persons.get(other.id)! : null;
  if (otherParent && otherParent.gender !== 'unknown' && otherParent.gender === parent.gender) {
    return fail('tooManyBiologicalParents', { gender: parent.gender });
  }
  const limits = capacity(ctx, inputs.length);
  if (errorsIn(limits).length > 0) return failWith(limits);

  const existing = childrenOf(g, parentId).map((id) => g.persons.get(id)!);
  const firstKey = nextSiblingKey(existing);
  const ids = parsed.people.map(() => ctx.newId());
  const people = parsed.people.map((p, i) => ({ ...p, childOrder: firstKey + i }));
  const links = ids.flatMap((childId) => [
    parentLink(parentId, childId, 'biological'),
    ...(other.id ? [parentLink(other.id, childId, 'biological')] : []),
  ]);

  const forward = [
    ...people.map((p, i) => createPerson(ctx, ids[i]!, p)),
    ...links.map((l) => createLink(ctx, l)),
    touchTree(ctx, ids.length),
  ];
  const inverse = [
    ...links.map((l) => remove(linkPath(ctx, l.id))),
    ...ids.map((id) => remove(personPath(ctx, id))),
    touchTree(ctx, -ids.length),
  ];
  return ok(
    {
      id: commandId(),
      labelKey: 'addChildren',
      labelValues: { count: ids.length },
      forward,
      inverse,
      touched: touchedPaths(forward),
      createdIds: ids,
    },
    [
      ...limits,
      ...duplicateWarnings(
        g,
        parsed.people,
        existing.map((p) => p.id),
      ),
    ],
  );
}

export interface AddSpouseOptions {
  status?: SpouseStatus;
}

/** Adds a new husband or wife (REL-02). Later marriages are numbered after earlier ones. */
export function addSpouse(
  ctx: CommandContext,
  personId: ID,
  input: NewPersonInput,
  { status = 'married' }: AddSpouseOptions = {},
): BuildResult {
  if (!ctx.graph.persons.has(personId)) return fail('missingPerson');
  const parsed = parsePeople([input]);
  if (!parsed.ok) return failWith(parsed.issues);
  const limits = capacity(ctx, 1);
  if (errorsIn(limits).length > 0) return failWith(limits);

  const id = ctx.newId();
  const link = spouseLink(personId, id, status, nextMarriageSequence(ctx.graph, personId));
  const forward = [
    createPerson(ctx, id, parsed.people[0]!),
    createLink(ctx, link),
    touchTree(ctx, 1),
  ];
  const inverse = [remove(linkPath(ctx, link.id)), remove(personPath(ctx, id)), touchTree(ctx, -1)];
  return ok(
    {
      id: commandId(),
      labelKey: 'addSpouse',
      forward,
      inverse,
      touched: touchedPaths(forward),
      createdIds: [id],
    },
    limits,
  );
}

export interface AddParentOptions {
  kind?: ParentKind;
  /**
   * When the child already has exactly one biological parent, also record the new parent
   * as that parent's spouse (default true), so the couple appears together.
   */
  marryExistingParent?: boolean;
}

/**
 * Adds a father or mother (REL-02). Adding a parent to the tree's root person makes the
 * new parent the root, so the tree keeps starting from the oldest known ancestor.
 */
export function addParent(
  ctx: CommandContext,
  childId: ID,
  input: NewPersonInput,
  { kind = 'biological', marryExistingParent = true }: AddParentOptions = {},
): BuildResult {
  const g = ctx.graph;
  if (!g.persons.has(childId)) return fail('missingPerson');
  const parsed = parsePeople([input]);
  if (!parsed.ok) return failWith(parsed.issues);
  const details = parsed.people[0]!;
  const biological = parentLinksOf(g, childId).filter((l) => l.kind === 'biological');
  if (
    kind === 'biological' &&
    (biological.length >= 2 ||
      (details.gender !== 'unknown' &&
        biological.some((l) => g.persons.get(l.parentId)?.gender === details.gender)))
  ) {
    return fail('tooManyBiologicalParents', { gender: details.gender });
  }
  const limits = capacity(ctx, 1);
  if (errorsIn(limits).length > 0) return failWith(limits);

  const id = ctx.newId();
  const link = parentLink(id, childId, kind);
  const partner =
    kind === 'biological' && marryExistingParent && biological.length === 1
      ? biological[0]!.parentId
      : null;
  const marriage = partner
    ? spouseLink(partner, id, 'married', nextMarriageSequence(g, partner))
    : null;
  const wasRoot = ctx.tree.rootPersonId === childId;

  const forward = [
    createPerson(ctx, id, details),
    createLink(ctx, link),
    ...(marriage ? [createLink(ctx, marriage)] : []),
    touchTree(ctx, 1, wasRoot ? { rootPersonId: id } : {}),
  ];
  const inverse = [
    ...(marriage ? [remove(linkPath(ctx, marriage.id))] : []),
    remove(linkPath(ctx, link.id)),
    remove(personPath(ctx, id)),
    touchTree(ctx, -1, wasRoot ? { rootPersonId: childId } : {}),
  ];
  return ok(
    {
      id: commandId(),
      labelKey: 'addParent',
      forward,
      inverse,
      touched: touchedPaths(forward),
      createdIds: [id],
    },
    limits,
  );
}

/**
 * Adds a brother or sister: a child of the person's parents, with the same kind of link
 * (REL-05). Without parents, the UI offers to add a parent first.
 */
export function addSibling(ctx: CommandContext, personId: ID, input: NewPersonInput): BuildResult {
  const g = ctx.graph;
  if (!g.persons.has(personId)) return fail('missingPerson');
  const parents = parentLinksOf(g, personId);
  if (parents.length === 0) return fail('noParents');
  const parsed = parsePeople([input]);
  if (!parsed.ok) return failWith(parsed.issues);
  const limits = capacity(ctx, 1);
  if (errorsIn(limits).length > 0) return failWith(limits);

  const id = ctx.newId();
  const siblings = childLinksOf(g, parents[0]!.parentId).map((l) => g.persons.get(l.childId)!);
  const details = { ...parsed.people[0]!, childOrder: nextSiblingKey(siblings) };
  const links = parents.map((p) => parentLink(p.parentId, id, p.kind));
  const forward = [
    createPerson(ctx, id, details),
    ...links.map((l) => createLink(ctx, l)),
    touchTree(ctx, 1),
  ];
  const inverse = [
    ...links.map((l) => remove(linkPath(ctx, l.id))),
    remove(personPath(ctx, id)),
    touchTree(ctx, -1),
  ];
  return ok(
    {
      id: commandId(),
      labelKey: 'addSibling',
      forward,
      inverse,
      touched: touchedPaths(forward),
      createdIds: [id],
    },
    [...limits, ...duplicateWarnings(g, parsed.people, [personId, ...siblingsOf(g, personId)])],
  );
}

const DETAIL_KEYS = [
  'nickname',
  'gender',
  'isLiving',
  'birth',
  'death',
  'profession',
  'education',
  'addresses',
  'phones',
  'email',
  'description',
  'photo',
  'customFields',
  'childOrder',
] as const satisfies readonly (keyof PersonDetails)[];

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Changes a person's details (PER-05). Only changed fields are written, with field paths,
 * so two people editing different fields don't overwrite each other (DESIGN §20.4). Edits
 * to the same person within 2 seconds merge into one undo step.
 */
export function updatePerson(
  ctx: CommandContext,
  personId: ID,
  patch: Partial<PersonDetails>,
): BuildResult {
  const current = ctx.graph.persons.get(personId);
  if (!current) return fail('missingPerson');
  const parsed = PersonDetailsSchema.safeParse({ ...detailsOf(current), ...patch });
  if (!parsed.success) return failWith(zodIssues(parsed.error));
  const next = parsed.data as PersonDetails;

  const forwardData: WriteData = {};
  const inverseData: WriteData = {};
  for (const lang of ['en', 'bn'] as const) {
    if (next.names[lang] !== current.names[lang]) {
      forwardData[`names.${lang}`] = next.names[lang] ?? DELETE_FIELD;
      inverseData[`names.${lang}`] = current.names[lang] ?? DELETE_FIELD;
    }
  }
  for (const key of DETAIL_KEYS) {
    if (!same(next[key], current[key])) {
      forwardData[key] = next[key] === undefined ? DELETE_FIELD : next[key];
      inverseData[key] = current[key] === undefined ? DELETE_FIELD : current[key];
    }
  }
  if (Object.keys(forwardData).length === 0) {
    return { ok: false, issues: [{ severity: 'warning', code: 'noChanges' }] };
  }
  const path = personPath(ctx, personId);
  const forward = [update(ctx, path, forwardData)];
  return ok({
    id: commandId(),
    labelKey: 'updatePerson',
    forward,
    inverse: [update(ctx, path, inverseData)],
    touched: [path],
    coalesceKey: `person:${personId}`,
  });
}

/**
 * Sets, replaces or removes a person's photo (MED-05). It is its own undo step, apart
 * from typed edits, and only takes photos stored for this person in this tree.
 */
export function setPersonPhoto(
  ctx: CommandContext,
  personId: ID,
  photo: PhotoRef | null,
): BuildResult {
  const current = ctx.graph.persons.get(personId);
  if (!current) return fail('missingPerson');
  if (photo) {
    const path = parsePhotoId(photo.publicId);
    const valid = PhotoRefSchema.safeParse(photo).success;
    if (!valid || path?.treeId !== ctx.treeId || path.personId !== personId) {
      return fail('invalidPhoto');
    }
  }
  const before = current.photo ?? null;
  if (same(before, photo)) {
    return { ok: false, issues: [{ severity: 'warning', code: 'noChanges' }] };
  }
  const path = personPath(ctx, personId);
  return ok({
    id: commandId(),
    labelKey: !photo ? 'removePhoto' : before ? 'replacePhoto' : 'addPhoto',
    forward: [update(ctx, path, { photo: photo ?? DELETE_FIELD })],
    inverse: [update(ctx, path, { photo: before ?? DELETE_FIELD })],
    touched: [path],
  });
}

function detailsOf(person: Person): PersonDetails {
  const {
    id: _id,
    createdAt: _ca,
    createdBy: _cb,
    updatedAt: _ua,
    updatedBy: _ub,
    schemaVersion: _sv,
    ...details
  } = person;
  return details;
}

export interface DeletePersonOptions {
  /** Also remove everyone who descends from this person (PER-06). */
  withDescendants?: boolean;
}

/**
 * Removes a person and every relationship they have; optionally their descendants too
 * (PER-06). Undo restores all of it exactly. Married-in spouses of removed descendants
 * stay, and appear among the unplaced people.
 */
export function deletePerson(
  ctx: CommandContext,
  personId: ID,
  { withDescendants = false }: DeletePersonOptions = {},
): BuildResult {
  const g = ctx.graph;
  const person = g.persons.get(personId);
  if (!person) return fail('missingPerson');
  const ids = new Set([personId, ...(withDescendants ? descendantIds(g, personId) : [])]);
  const links = [...g.links.values()].filter((l) =>
    l.type === 'parent'
      ? ids.has(l.parentId) || ids.has(l.childId)
      : l.personIds.some((p) => ids.has(p)),
  );
  if (ids.size + links.length + 1 > MAX_BATCH_OPS)
    return fail('tooLargeToDelete', { count: ids.size });

  const { rootPersonId } = ctx.tree;
  let rootChange: WriteData = {};
  let rootRestore: WriteData = {};
  if (rootPersonId && ids.has(rootPersonId)) {
    const heir = withDescendants ? undefined : childrenOf(g, personId)[0];
    rootChange = { rootPersonId: heir ?? DELETE_FIELD };
    rootRestore = { rootPersonId };
  }
  const people = [...ids].map((id) => g.persons.get(id)!);
  const forward = [
    ...links.map((l) => remove(linkPath(ctx, l.id))),
    ...people.map((p) => remove(personPath(ctx, p.id))),
    touchTree(ctx, -ids.size, rootChange),
  ];
  const inverse = [
    ...people.map((p) => restorePerson(ctx, p)),
    ...links.map((l: Relationship) => restoreLink(ctx, l)),
    touchTree(ctx, ids.size, rootRestore),
  ];
  return ok({
    id: commandId(),
    labelKey: 'deletePerson',
    labelValues: { count: ids.size },
    forward,
    inverse,
    touched: touchedPaths(forward),
  });
}
