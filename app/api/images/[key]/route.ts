import { db, handle, HttpError, json, requireMember, visiblePost } from '../../../../lib/server';
import { bucket } from '../../../../lib/images';

export const dynamic = 'force-dynamic';

// A photo is visible to whoever can see its post; an unattached upload only to its uploader.
export async function GET(request: Request, context: { params: Promise<{ key: string }> }) {
  return handle(async () => {
    const member = await requireMember(request);
    const { key } = await context.params;
    const row = await db()
      .prepare('SELECT owner_id,post_id FROM images WHERE key=?')
      .bind(key)
      .first<{ owner_id: string; post_id: string | null }>();
    if (!row) throw new HttpError(404, '사진을 찾을 수 없어요.');
    if (row.post_id) await visiblePost(row.post_id, member);
    else if (row.owner_id !== member.userId) throw new HttpError(404, '사진을 찾을 수 없어요.');
    // onlyIf answers If-None-Match: a matching ETag comes back without a body.
    const object = await bucket().get(key, { onlyIf: request.headers });
    if (!object) throw new HttpError(404, '사진을 찾을 수 없어요.');
    const headers = {
      // Revalidate every time so a photo stops showing once its viewer loses access; the ETag keeps that cheap.
      'Cache-Control': 'private, no-cache',
      ETag: object.httpEtag,
      'X-Content-Type-Options': 'nosniff',
    };
    if (!('body' in object)) return new Response(null, { status: 304, headers });
    return new Response(object.body, {
      headers: { ...headers, 'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream' },
    });
  });
}

// The uploader may throw away a photo they took back before posting; attached photos go with their post.
export async function DELETE(request: Request, context: { params: Promise<{ key: string }> }) {
  return handle(async () => {
    const member = await requireMember(request);
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) throw new HttpError(403, '요청을 처리하지 못했어요. 페이지를 새로고침한 뒤 다시 시도해주세요.');
    const { key } = await context.params;
    const result = await db()
      .prepare('DELETE FROM images WHERE key=? AND owner_id=? AND post_id IS NULL')
      .bind(key, member.userId)
      .run();
    if (!result.meta.changes) throw new HttpError(404, '사진을 찾을 수 없어요.');
    await bucket().delete(key);
    return json({ ok: true });
  });
}
