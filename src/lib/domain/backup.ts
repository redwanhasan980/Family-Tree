import { z } from 'zod';

import { parentLinkId, spouseLinkId } from './ids';
import {
  IdSchema,
  ParentKindSchema,
  PartialDateSchema,
  PersonDetailsSchema,
  PhotoRefSchema,
  SpouseStatusSchema,
  TreeDetailsSchema,
  TreeSettingsSchema,
} from './schemas';

import type { Person, PhotoRef, Relationship, Tree } from './types';

/** The backup format's identifier and version (DESIGN §18.1). */
export const BACKUP_FORMAT = 'shikor-backup';
export const BACKUP_VERSION = 1;

const IsoDateSchema = z.iso.datetime({ offset: true });

/** A photo reference, with a link to the image so a backup is useful on its own. */
const BackupPhotoSchema = PhotoRefSchema.extend({ url: z.url().optional() });

const BackupPersonSchema = PersonDetailsSchema.extend({
  id: IdSchema,
  photo: BackupPhotoSchema.nullable().optional(),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
});

const BackupRelationshipSchema = z.discriminatedUnion('type', [
  z.object({
    id: z.string(),
    type: z.literal('parent'),
    parentId: IdSchema,
    childId: IdSchema,
    kind: ParentKindSchema,
  }),
  z.object({
    id: z.string(),
    type: z.literal('spouse'),
    personIds: z.tuple([IdSchema, IdSchema]),
    status: SpouseStatusSchema,
    marriageDate: PartialDateSchema.optional(),
    sequence: z.int().min(1).max(50).optional(),
  }),
]);

/**
 * A whole tree as one JSON file (BAK-01): its details and settings, everyone with their
 * details and photo references, and every relationship. No user IDs or roles: a backup
 * belongs to whoever restores it (BAK-02, R2).
 */
export const BackupSchema = z
  .object({
    format: z.literal(BACKUP_FORMAT),
    version: z.literal(BACKUP_VERSION),
    exportedAt: IsoDateSchema,
    app: z.object({ name: z.string(), version: z.string() }),
    tree: TreeDetailsSchema.extend({
      rootPersonId: IdSchema.optional(),
      settings: TreeSettingsSchema,
    }),
    persons: z.array(BackupPersonSchema),
    relationships: z.array(BackupRelationshipSchema),
  })
  .check((ctx) => {
    const ids = new Set(ctx.value.persons.map((p) => p.id));
    ctx.value.relationships.forEach((link, index) => {
      const people = link.type === 'parent' ? [link.parentId, link.childId] : link.personIds;
      const expected =
        link.type === 'parent'
          ? parentLinkId(link.parentId, link.childId)
          : spouseLinkId(link.personIds[0], link.personIds[1]);
      if (people.some((id) => !ids.has(id)) || link.id !== expected) {
        ctx.issues.push({
          code: 'custom',
          message: 'invalidRelationship',
          path: ['relationships', index],
          input: link,
        });
      }
    });
  });

/** A backup as written; `ParsedBackup` is one read back (text trimmed, defaults filled). */
export type Backup = z.input<typeof BackupSchema>;
export type ParsedBackup = z.output<typeof BackupSchema>;
type BackupPerson = Backup['persons'][number];
type BackupRelationship = Backup['relationships'][number];

export interface BackupInput {
  tree: Tree;
  persons: Iterable<Person>;
  relationships: Iterable<Relationship>;
  exportedAt: Date;
  app: { name: string; version: string };
  /** The full-size image's address, when photos are configured. */
  photoUrl?: (photo: PhotoRef) => string | null;
}

const withUrl = (photo: PhotoRef, url: string | null) => (url ? { ...photo, url } : { ...photo });

function personEntry(person: Person, photoUrl: BackupInput['photoUrl']): BackupPerson {
  const {
    id,
    createdAt,
    updatedAt,
    createdBy: _createdBy,
    updatedBy: _updatedBy,
    schemaVersion: _schemaVersion,
    photo,
    ...details
  } = person;
  return {
    id,
    ...details,
    ...(photo && { photo: withUrl(photo, photoUrl?.(photo) ?? null) }),
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  };
}

function relationshipEntry(link: Relationship): BackupRelationship {
  if (link.type === 'parent') {
    const { id, type, parentId, childId, kind } = link;
    return { id, type, parentId, childId, kind };
  }
  const { id, type, personIds, status, marriageDate, sequence } = link;
  return {
    id,
    type,
    personIds,
    status,
    ...(marriageDate && { marriageDate }),
    ...(sequence !== undefined && { sequence }),
  };
}

const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The backup of a tree, in a stable order so two backups of one tree compare line by line. */
export function buildBackup(input: BackupInput): Backup {
  const { tree } = input;
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: input.exportedAt.toISOString(),
    app: input.app,
    tree: {
      name: tree.name,
      ...(tree.description && { description: tree.description }),
      ...(tree.rootPersonId && { rootPersonId: tree.rootPersonId }),
      settings: tree.settings,
    },
    persons: [...input.persons].sort(byId).map((p) => personEntry(p, input.photoUrl)),
    relationships: [...input.relationships].sort(byId).map(relationshipEntry),
  };
}

/** Reads a backup file's text; null when it isn't a valid backup (BAK-02 builds on this). */
export function parseBackup(text: string): ParsedBackup | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = BackupSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}
