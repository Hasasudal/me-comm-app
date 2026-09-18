import { db, handle, HttpError, isAdmin, requireMember, visiblePost } from '../../../../lib/server';
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
    if (!row) throw new HttpError(404, '사진을 찾을 수 없습니다.');
    if (row.post_id) await visiblePost(row.post_id, member, await isAdmin(member.userId));
    else if (row.owner_id !== member.userId) throw new HttpError(404, '사진을 찾을 수 없습니다.');
    const object = await bucket().get(key);
    if (!object) throw new HttpError(404, '사진을 찾을 수 없습니다.');
    return new Response(object.body, {
      headers: {
        'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
        // Keys never change content, so browsers may keep them; "private" keeps shared caches out.
        'Cache-Control': 'private, max-age=86400, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  });
}
