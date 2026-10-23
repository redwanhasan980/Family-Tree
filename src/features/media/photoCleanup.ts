import { MAX_DELETE_IDS, parsePhotoId, type MediaDeleteResult } from '@/lib/domain/media';
import { isFieldOp, type WriteOp } from '@/lib/domain/writes';
import { logger } from '@/lib/logger';
import { ApiError, callApi } from '@/lib/repositories/api';

/**
 * Deferred photo deletion (P5-06, MED-05, PER-06). Cloudinary has no undo, so a photo
 * that was replaced, removed or deleted with its person waits in a queue (kept in this
 * browser, so a reload doesn't lose it) until nothing can bring it back: no person has it
 * and no undo or redo step mentions it. The server checks "in use" once more.
 */

const STORAGE_KEY = 'shikor:photoCleanup';

interface Pending {
  treeId: string;
  publicId: string;
}

function photoOf(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || isFieldOp(value)) return null;
  const publicId = (value as { publicId?: unknown }).publicId;
  return typeof publicId === 'string' ? publicId : null;
}

/** The photo IDs a batch of writes puts into person documents. */
export function photoIdsIn(ops: readonly WriteOp[]): Set<string> {
  const ids = new Set<string>();
  for (const op of ops) {
    if (op.op === 'delete') continue;
    const id = photoOf(op.data.photo);
    if (id) ids.add(id);
  }
  return ids;
}

/** Photos one side of a change has and the other doesn't: what applying `after` removes. */
export function removedPhotos(before: readonly WriteOp[], after: readonly WriteOp[]): string[] {
  const kept = photoIdsIn(after);
  return [...photoIdsIn(before)].filter((id) => !kept.has(id));
}

function load(): Pending[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown;
    return Array.isArray(parsed)
      ? parsed.filter(
          (p): p is Pending => typeof p?.treeId === 'string' && typeof p?.publicId === 'string',
        )
      : [];
  } catch {
    return [];
  }
}

function save(queue: readonly Pending[]): void {
  try {
    if (queue.length === 0) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Storage blocked: the orphan sweep (R2) cleans up instead.
  }
}

/** Adds photos to the queue; IDs that aren't ours are ignored. */
export function queuePhotoDeletion(publicIds: readonly string[]): void {
  if (publicIds.length === 0) return;
  const queue = load();
  for (const publicId of publicIds) {
    const path = parsePhotoId(publicId);
    if (!path || queue.some((p) => p.publicId === publicId)) continue;
    queue.push({ treeId: path.treeId, publicId });
  }
  save(queue);
}

export function pendingPhotoDeletions(): string[] {
  return load().map((p) => p.publicId);
}

let flushing: Promise<void> | null = null;

/**
 * Deletes the queued photos `stillNeeded` doesn't claim, tree by tree. Photos the server
 * deleted, kept as in use, or refused for good leave the queue; on a network or server
 * failure they stay for the next try.
 */
export function flushPhotoDeletions(stillNeeded: (publicId: string) => boolean): Promise<void> {
  flushing ??= (async () => {
    try {
      const ready = load().filter((p) => !stillNeeded(p.publicId));
      const done = new Set<string>();
      const byTree = new Map<string, string[]>();
      for (const p of ready) byTree.set(p.treeId, [...(byTree.get(p.treeId) ?? []), p.publicId]);
      for (const [treeId, ids] of byTree) {
        for (let i = 0; i < ids.length; i += MAX_DELETE_IDS) {
          const chunk = ids.slice(i, i + MAX_DELETE_IDS);
          try {
            await callApi<MediaDeleteResult>('/api/media/delete', {
              body: { treeId, publicIds: chunk },
            });
            for (const id of chunk) done.add(id);
          } catch (error) {
            const permanent =
              error instanceof ApiError &&
              ['invalid_request', 'forbidden', 'not_found'].includes(error.code);
            if (permanent) for (const id of chunk) done.add(id);
            else
              logger.warn('media.cleanup', {
                code: error instanceof ApiError ? error.code : 'unknown',
              });
          }
        }
      }
      if (done.size > 0) save(load().filter((p) => !done.has(p.publicId)));
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}
