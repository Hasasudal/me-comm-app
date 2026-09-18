import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { db } from './database';
import { HttpError } from './http-error';

export const MAX_IMAGES = 5;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
// Unsent uploads a member may hold at once, so storage cannot be filled with files no post uses.
export const MAX_UNATTACHED = 20;
// The body must really be the declared image type, not just labelled as one.
export function looksLike(ext: string, bytes: Uint8Array) {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (ext === 'jpg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (ext === 'png') return bytes[0] === 0x89 && ascii(1, 4) === 'PNG';
  return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
}
export const imageTypes: Record<string, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };
export const imagesField = z
  .array(z.string().regex(/^[0-9a-f-]{36}\.(webp|jpg|png)$/, '사진 정보가 올바르지 않습니다.'))
  .max(MAX_IMAGES, `사진은 ${MAX_IMAGES}장까지 올릴 수 있습니다.`)
  .optional();

export function bucket() {
  if (!env.BUCKET) throw new HttpError(503, '사진 저장소에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.');
  return env.BUCKET;
}

export async function postImages(postId: string) {
  const rows = await db()
    .prepare('SELECT key FROM images WHERE post_id=? ORDER BY position')
    .bind(postId)
    .all<{ key: string }>();
  return rows.results.map((row) => row.key);
}

// New photos must be the member's own unattached uploads. Run before writing the post so a bad photo list
// fails the whole request instead of leaving a post saved without its photos.
export async function checkImages(keys: string[] | undefined, userId: string, current: string[] = []) {
  const added = (keys || []).filter((key) => !current.includes(key));
  if (new Set(keys).size !== (keys || []).length) throw new HttpError(400, '같은 사진이 두 번 들어 있습니다.');
  if (added.length) {
    const owned = await db()
      .prepare(
        `SELECT key FROM images WHERE owner_id=? AND post_id IS NULL AND key IN (${added.map(() => '?').join(',')})`,
      )
      .bind(userId, ...added)
      .all<{ key: string }>();
    if (owned.results.length !== added.length) throw new HttpError(400, '사진을 다시 올려주세요.');
  }
}

// Point a post at exactly `keys` (in order); photos dropped from the post are deleted from storage.
export async function attachImages(postId: string, keys: string[] | undefined, userId: string) {
  if (!keys) return;
  const current = await postImages(postId);
  await checkImages(keys, userId, current);
  const removed = current.filter((key) => !keys.includes(key));
  await db().batch([
    ...keys.map((key, position) =>
      db().prepare('UPDATE images SET post_id=?,position=? WHERE key=?').bind(postId, position, key),
    ),
    ...removed.map((key) => db().prepare('DELETE FROM images WHERE key=?').bind(key)),
  ]);
  if (removed.length) await bucket().delete(removed);
}

// Uploads never attached to a post (a form left unsent) are removed after a day. Called on each upload so
// cleanup keeps pace with use without a scheduled job; `ownerId` clears one member's uploads right away.
export async function sweepUnattached(ownerId?: string) {
  const rows = await db()
    .prepare(
      ownerId
        ? 'SELECT key FROM images WHERE post_id IS NULL AND owner_id=?'
        : 'SELECT key FROM images WHERE post_id IS NULL AND created_at<? LIMIT 50',
    )
    .bind(ownerId ?? Date.now() - 24 * 60 * 60 * 1000)
    .all<{ key: string }>();
  const keys = rows.results.map((row) => row.key);
  if (!keys.length) return;
  await db()
    .prepare(`DELETE FROM images WHERE key IN (${keys.map(() => '?').join(',')})`)
    .bind(...keys)
    .run();
  await bucket().delete(keys);
}

// Deletes the photos of the given posts, both rows and stored files.
export async function deletePostImages(postIds: string[]) {
  if (!postIds.length) return;
  const marks = postIds.map(() => '?').join(',');
  const rows = await db()
    .prepare(`SELECT key FROM images WHERE post_id IN (${marks})`)
    .bind(...postIds)
    .all<{ key: string }>();
  if (!rows.results.length) return;
  await db()
    .prepare(`DELETE FROM images WHERE post_id IN (${marks})`)
    .bind(...postIds)
    .run();
  await bucket().delete(rows.results.map((row) => row.key));
}
