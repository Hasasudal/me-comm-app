import { db, handle, HttpError, json, limit, requireMember } from '../../../lib/server';
import { bucket, imageTypes, looksLike, MAX_IMAGE_BYTES, MAX_UNATTACHED, sweepUnattached } from '../../../lib/images';

export const dynamic = 'force-dynamic';

// Uploads one photo (the raw image as the body). It stays unattached until a post claims it.
export async function POST(request: Request) {
  return handle(async () => {
    const member = await requireMember(request);
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) throw new HttpError(403, '허용되지 않은 요청입니다.');
    const type = (request.headers.get('content-type') || '').split(';')[0].trim();
    const ext = imageTypes[type];
    if (!ext) throw new HttpError(415, 'JPG, PNG, WebP 사진만 올릴 수 있습니다.');
    await limit(request, 'image', 30, member.userId);
    const body = await request.arrayBuffer();
    if (!body.byteLength) throw new HttpError(400, '사진이 비어 있습니다.');
    if (body.byteLength > MAX_IMAGE_BYTES) throw new HttpError(413, '사진은 5MB 이하만 올릴 수 있습니다.');
    if (!looksLike(ext, new Uint8Array(body, 0, Math.min(12, body.byteLength))))
      throw new HttpError(415, '사진 파일이 올바르지 않습니다.');
    const pending = await db()
      .prepare('SELECT COUNT(*) AS count FROM images WHERE owner_id=? AND post_id IS NULL')
      .bind(member.userId)
      .first<{ count: number }>();
    if ((pending?.count || 0) >= MAX_UNATTACHED)
      throw new HttpError(429, '등록하지 않은 사진이 너무 많습니다. 글을 먼저 등록하거나 내일 다시 시도해주세요.');
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
