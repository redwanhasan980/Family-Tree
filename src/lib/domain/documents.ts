import { DEFAULT_TREE_SETTINGS } from './schemas';
import { SERVER_TIME, type WriteData } from './writes';

import type {
  CustomField,
  Gender,
  ID,
  LifeEvent,
  ParentKind,
  PartialDate,
  Person,
  PersonDetails,
  PhotoRef,
  Relationship,
  Role,
  SpouseStatus,
  Stamps,
  Tree,
  TreeSettings,
} from './types';

/**
 * Stored documents ↔ domain objects. Reading is defensive: unknown or malformed fields
 * fall back to safe values so one bad document never stops a tree from opening
 * (NFR-REL-04). Timestamps arrive as `Date`s (the Firestore converter turns them).
 */

type Data = Record<string, unknown>;

const isObject = (v: unknown): v is Data =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 ? v : undefined;
const int = (v: unknown): number | undefined => (Number.isInteger(v) ? (v as number) : undefined);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;
const dateOr = (v: unknown, fallback: Date): Date =>
  v instanceof Date && !Number.isNaN(v.getTime()) ? v : fallback;

/** Drops `undefined` values at every depth: Firestore rejects them. `null` is kept. */
export function compact<T>(value: T): T {
  if (Array.isArray(value)) return value.map(compact) as T;
  if (!isObject(value) || value instanceof Date) return value;
  const out: Data = {};
  for (const [key, inner] of Object.entries(value)) {
    if (inner !== undefined) out[key] = compact(inner);
  }
  return out as T;
}

// ---------- reading ----------

function readDate(v: unknown): PartialDate | undefined {
  if (!isObject(v)) return undefined;
  const year = int(v.year);
  if (year === undefined) return undefined;
  const month = int(v.month);
  const day = month === undefined ? undefined : int(v.day);
  return compact({ year, month, day, approximate: v.approximate === true ? true : undefined });
}

function readEvent(v: unknown): LifeEvent | undefined {
  if (!isObject(v)) return undefined;
  const event = compact({ date: readDate(v.date), place: str(v.place) });
  return Object.keys(event).length > 0 ? event : undefined;
}

function readPhoto(v: unknown): PhotoRef | null | undefined {
  if (v === null) return null;
  if (!isObject(v) || !str(v.publicId)) return undefined;
  const [version, width, height] = [int(v.version), int(v.width), int(v.height)];
  if (version === undefined || width === undefined || height === undefined) return undefined;
  return { publicId: v.publicId as string, version, width, height };
}

function readStamps(d: Data, fallback: Date): Stamps {
  return {
    createdAt: dateOr(d.createdAt, fallback),
    createdBy: str(d.createdBy) ?? '',
    updatedAt: dateOr(d.updatedAt, fallback),
    updatedBy: str(d.updatedBy) ?? '',
  };
}

const GENDERS: readonly Gender[] = ['male', 'female', 'unknown'];
const KINDS: readonly ParentKind[] = ['biological', 'adoptive', 'step', 'foster'];
const STATUSES: readonly SpouseStatus[] = ['married', 'divorced', 'separated', 'widowed'];
const ROLES: readonly Role[] = ['owner', 'editor', 'viewer'];

export function personFromDoc(id: ID, data: unknown, fallbackTime: Date): Person | null {
  if (!isObject(data)) return null;
  const names = isObject(data.names) ? data.names : {};
  const addresses = isObject(data.addresses)
    ? compact({ present: str(data.addresses.present), permanent: str(data.addresses.permanent) })
    : undefined;
  const phones = Array.isArray(data.phones)
    ? data.phones.filter((p): p is string => typeof p === 'string')
    : undefined;
  const customFields = Array.isArray(data.customFields)
    ? data.customFields.flatMap((f): CustomField[] =>
        isObject(f) &&
        typeof f.id === 'string' &&
        typeof f.label === 'string' &&
        typeof f.value === 'string'
          ? [{ id: f.id, label: f.label, value: f.value }]
          : [],
      )
    : undefined;

  return compact({
    id,
    names: compact({ en: str(names.en), bn: str(names.bn) }),
    nickname: str(data.nickname),
    gender: oneOf(data.gender, GENDERS, 'unknown'),
    isLiving: data.isLiving !== false,
    birth: readEvent(data.birth),
    death: readEvent(data.death),
    profession: str(data.profession),
    education: str(data.education),
    addresses: addresses && Object.keys(addresses).length > 0 ? addresses : undefined,
    phones: phones && phones.length > 0 ? phones : undefined,
    email: str(data.email),
    description: str(data.description),
    photo: readPhoto(data.photo),
    customFields: customFields && customFields.length > 0 ? customFields : undefined,
    childOrder:
      typeof data.childOrder === 'number' && Number.isFinite(data.childOrder)
        ? data.childOrder
        : undefined,
    ...readStamps(data, fallbackTime),
    schemaVersion: 1,
  } satisfies Person);
}

export function relationshipFromDoc(
  id: string,
  data: unknown,
  fallbackTime: Date,
): Relationship | null {
  if (!isObject(data)) return null;
  const stamps = readStamps(data, fallbackTime);
  if (data.type === 'parent' && id.startsWith('p_')) {
    const [parentId, childId] = [str(data.parentId), str(data.childId)];
    if (!parentId || !childId) return null;
    return {
      id: id as `p_${string}_${string}`,
      type: 'parent',
      parentId,
      childId,
      kind: oneOf(data.kind, KINDS, 'biological'),
      ...stamps,
      schemaVersion: 1,
    };
  }
  if (data.type === 'spouse' && id.startsWith('s_')) {
    const ids = Array.isArray(data.personIds) ? data.personIds : [];
    const [a, b] = [str(ids[0]), str(ids[1])];
    if (!a || !b || ids.length !== 2) return null;
    return compact({
      id: id as `s_${string}_${string}`,
      type: 'spouse' as const,
      personIds: [a, b] as [ID, ID],
      status: oneOf(data.status, STATUSES, 'married'),
      marriageDate: readDate(data.marriageDate),
      sequence: int(data.sequence),
      ...stamps,
      schemaVersion: 1 as const,
    });
  }
  return null;
}

function readSettings(v: unknown): TreeSettings {
  const s = isObject(v) ? v : {};
  const d = DEFAULT_TREE_SETTINGS;
  return {
    nameDisplay: oneOf(s.nameDisplay, ['auto', 'en', 'bn', 'both'], d.nameDisplay),
    colorBy: oneOf(s.colorBy, ['branch', 'gender', 'generation', 'none'], d.colorBy),
    showPhotos: typeof s.showPhotos === 'boolean' ? s.showPhotos : d.showPhotos,
    showDates: typeof s.showDates === 'boolean' ? s.showDates : d.showDates,
    defaultView: oneOf(
      s.defaultView,
      ['tree', 'family', 'circle', 'list', 'album', 'timeline'],
      d.defaultView,
    ),
    kinshipStyle: oneOf(s.kinshipStyle, ['bd', 'wb'], d.kinshipStyle),
  };
}

export function treeFromDoc(id: ID, data: unknown, fallbackTime: Date): Tree | null {
  if (!isObject(data)) return null;
  const ownerId = str(data.ownerId);
  if (!ownerId) return null;
  const roles: Record<ID, Role> = {};
  if (isObject(data.roles)) {
    for (const [uid, role] of Object.entries(data.roles)) {
      if (ROLES.includes(role as Role)) roles[uid] = role as Role;
    }
  }
  const memberIds = Array.isArray(data.memberIds)
    ? data.memberIds.filter((m): m is ID => typeof m === 'string')
    : [];
  return compact({
    id,
    name: str(data.name) ?? '',
    description: str(data.description),
    ownerId,
    memberIds,
    roles,
    rootPersonId: str(data.rootPersonId),
    personCount: Math.max(0, int(data.personCount) ?? 0),
    settings: readSettings(data.settings),
    createdAt: dateOr(data.createdAt, fallbackTime),
    updatedAt: dateOr(data.updatedAt, fallbackTime),
    updatedBy: str(data.updatedBy) ?? '',
    schemaVersion: 1 as const,
  });
}

// ---------- writing ----------

/** Stamps for a new document written by `uid`. */
export function newStamps(uid: ID): WriteData {
  return {
    createdAt: SERVER_TIME,
    createdBy: uid,
    updatedAt: SERVER_TIME,
    updatedBy: uid,
    schemaVersion: 1,
  };
}

/** Stamps for an update by `uid`. */
export function updateStamps(uid: ID): WriteData {
  return { updatedAt: SERVER_TIME, updatedBy: uid };
}

/** Stamps to bring back a deleted document exactly as it was created (undo). */
export function restoreStamps(original: Stamps, uid: ID): WriteData {
  return {
    createdAt: original.createdAt,
    createdBy: original.createdBy,
    updatedAt: SERVER_TIME,
    updatedBy: uid,
    schemaVersion: 1,
  };
}

/** A person's stored fields, without id or stamps. */
export function personFields(details: PersonDetails): WriteData {
  const {
    names,
    nickname,
    gender,
    isLiving,
    birth,
    death,
    profession,
    education,
    addresses,
    phones,
    email,
    description,
    photo,
    customFields,
    childOrder,
  } = details;
  return compact({
    names,
    nickname,
    gender,
    isLiving,
    birth,
    death,
    profession,
    education,
    addresses,
    phones,
    email,
    description,
    photo,
    customFields,
    childOrder,
  });
}

/** The full document for a person: fields plus stamps. */
export function personDoc(person: Person, stamps: WriteData): WriteData {
  return { ...personFields(person), ...stamps };
}

/** A relationship's stored fields, without id or stamps. */
export function relationshipFields(link: Relationship): WriteData {
  if (link.type === 'parent') {
    return { type: 'parent', parentId: link.parentId, childId: link.childId, kind: link.kind };
  }
  return compact({
    type: 'spouse',
    personIds: [...link.personIds],
    status: link.status,
    marriageDate: link.marriageDate,
    sequence: link.sequence,
  });
}
