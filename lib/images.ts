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
// Drops APP1 segments (EXIF, incl. GPS, and XMP) from a JPEG; everything else is kept byte for byte.
// Returns null when the marker walk does not add up, so a malformed file is rejected rather than stored.
export function stripJpegMetadata(bytes: Uint8Array) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const kept: Uint8Array[] = [bytes.subarray(0, 2)];
  let at = 2;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1];
    if (marker === 0xff) {
      at++; // fill byte
      continue;
    }
    if (marker === 0xda) break; // start of scan: the rest is image data
    const end = at + 2 + ((bytes[at + 2] << 8) | bytes[at + 3]);
    if (end > bytes.length || end < at + 4) return null;
    if (marker !== 0xe1) kept.push(bytes.subarray(at, end));
    at = end;
  }
  if (bytes[at] !== 0xff || bytes[at + 1] !== 0xda) return null;
  kept.push(bytes.subarray(at));
  const out = new Uint8Array(kept.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of kept) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
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
  // The WHERE re-checks ownership at write time, so a photo claimed by another post since checkImages is not
  // stolen. Photos already on this post may belong to someone else (an admin editing), hence the OR.
  const statements = [
    ...keys.map((key, position) =>
      db()
        .prepare('UPDATE images SET post_id=?,position=? WHERE key=? AND (post_id=? OR (post_id IS NULL AND owner_id=?))')
        .bind(postId, position, key, postId, userId),
    ),
    ...removed.map((key) => db().prepare('DELETE FROM images WHERE key=?').bind(key)),
  ];
  // D1 rejects an empty batch, and most posts have no photos.
  const results = statements.length ? await db().batch(statements) : [];
  if (removed.length) await bucket().delete(removed);
  if (results.slice(0, keys.length).some((result) => result.meta.changes !== 1))
    throw new HttpError(409, '사진 일부를 붙이지 못했습니다. 사진을 다시 올려주세요.');
}

// Uploads never attached to a post (a form left unsent) are removed after a day. Called on each upload so
// cleanup keeps pace with use without a scheduled job; `ownerId` clears one member's uploads older than `age`
// (all of them by default). Returns how many were removed.
export async function sweepUnattached(ownerId?: string, age = 0) {
  const rows = await (
    ownerId
      ? db()
          .prepare('SELECT key FROM images WHERE post_id IS NULL AND owner_id=? AND created_at<=?')
          .bind(ownerId, Date.now() - age)
      : db()
          .prepare('SELECT key FROM images WHERE post_id IS NULL AND created_at<? LIMIT 50')
          .bind(Date.now() - 24 * 60 * 60 * 1000)
  ).all<{ key: string }>();
  const keys = rows.results.map((row) => row.key);
  if (!keys.length) return 0;
  await db()
    .prepare(`DELETE FROM images WHERE key IN (${keys.map(() => '?').join(',')})`)
    .bind(...keys)
    .run();
  await bucket().delete(keys);
  return keys.length;
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
