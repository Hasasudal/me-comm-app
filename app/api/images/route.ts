import { db, handle, HttpError, json, limit, requireMember } from '../../../lib/server';
import {
  bucket,
  imageTypes,
  looksLike,
  MAX_IMAGE_BYTES,
  MAX_UNATTACHED,
  stripMetadata,
  sweepUnattached,
} from '../../../lib/images';

export const dynamic = 'force-dynamic';

const tooBig = () => new HttpError(413, '사진은 5MB 이하만 올릴 수 있어요. 크기를 줄여서 다시 올려주세요.');

// Reads the body but stops as soon as it passes the cap, so a missing or false Content-Length cannot make the
// worker buffer more than that.
async function readBody(request: Request) {
  if (Number(request.headers.get('content-length')) > MAX_IMAGE_BYTES) throw tooBig();
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_IMAGE_BYTES) {
      await reader.cancel();
      throw tooBig();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

// Uploads one photo (the raw image as the body). It stays unattached until a post claims it.
export async function POST(request: Request) {
  return handle(async () => {
    const member = await requireMember(request);
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) throw new HttpError(403, '요청을 처리하지 못했어요. 페이지를 새로고침한 뒤 다시 시도해주세요.');
    const type = (request.headers.get('content-type') || '').split(';')[0].trim();
    const ext = imageTypes[type];
    if (!ext) throw new HttpError(415, 'JPG, PNG, WebP 사진만 올릴 수 있어요.');
    await limit(request, 'image', 30, member.userId);
    await limit(request, 'image-day', 100, member.userId, 86400000);
    let body: Uint8Array | null = await readBody(request);
    if (!body.byteLength) throw new HttpError(400, '사진이 비어 있어요. 다른 사진을 올려주세요.');
    if (!looksLike(ext, body.subarray(0, 12))) throw new HttpError(415, '사진 파일이 올바르지 않아요. 다른 사진을 올려주세요.');
    // The app re-encodes photos, but a direct upload could still carry the camera's GPS position.
    body = stripMetadata(ext, body);
    if (!body) throw new HttpError(415, '사진 파일이 올바르지 않아요. 다른 사진을 올려주세요.');
    const pending = await db()
      .prepare('SELECT COUNT(*) AS count FROM images WHERE owner_id=? AND post_id IS NULL')
      .bind(member.userId)
      .first<{ count: number }>();
    let count = pending?.count || 0;
    // Photos from drafts given up an hour ago or more make room before the cap turns the member away.
    if (count >= MAX_UNATTACHED) count -= await sweepUnattached(member.userId, 60 * 60 * 1000);
    if (count >= MAX_UNATTACHED)
      throw new HttpError(429, '등록하지 않은 사진이 너무 많아요. 글을 먼저 등록하거나 한 시간 뒤 다시 시도해주세요.');
    const key = `${crypto.randomUUID()}.${ext}`;
    await bucket().put(key, body, { httpMetadata: { contentType: type } });
    await db()
      .prepare('INSERT INTO images (key,owner_id,post_id,position,created_at) VALUES (?,?,NULL,0,?)')
      .bind(key, member.userId, Date.now())
      .run();
    await sweepUnattached();
    return json({ key }, 201);
  });
}
