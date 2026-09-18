import { z } from 'zod';
import { db, handle, json, parseReview, requireAdmin } from '../../../../lib/server';
export const dynamic = 'force-dynamic';
const PAGE_SIZE = 30;
export async function GET(request: Request) {
  return handle(async () => {
    await requireAdmin(request);
    const url = new URL(request.url);
    const status = z
      .enum(['pending', 'feedback', 'rejected', 'published'])
      .catch('pending')
      .parse(url.searchParams.get('status') || 'pending');
    // Keyset cursor "updatedAt:id"; approved news keeps piling up, so the queue loads in pages.
    const cursor = /^(\d+):([\w-]+)$/.exec(url.searchParams.get('cursor') || '');
    const after = cursor ? ' AND (updated_at<? OR (updated_at=? AND id<?))' : '';
    const binds = cursor ? [status, Number(cursor[1]), Number(cursor[1]), cursor[2]] : [status];
    const [rows, total] = await Promise.all([
      db()
        .prepare(
          `SELECT id,title,category,content,prefix,author_name,status,feedback,created_at,updated_at FROM posts WHERE category='news' AND status=?${after} ORDER BY updated_at DESC, id DESC LIMIT ?`,
        )
        .bind(...binds, PAGE_SIZE + 1)
        .all<{ id: string; updated_at: number; feedback: string | null }>(),
      db()
        .prepare("SELECT COUNT(*) AS count FROM posts WHERE category='news' AND status=?")
        .bind(status)
        .first<{ count: number }>(),
    ]);
    const posts = rows.results.slice(0, PAGE_SIZE);
    const last = posts[posts.length - 1];
    // Photos of the listed articles, in order, so the review panel and Word export can show them.
    const photos = posts.length
      ? await db()
          .prepare(
            `SELECT post_id,key FROM images WHERE post_id IN (${posts.map(() => '?').join(',')}) ORDER BY position`,
          )
          .bind(...posts.map((post) => post.id))
          .all<{ post_id: string; key: string }>()
      : null;
    const imagesOf = (id: string) => (photos?.results || []).filter((row) => row.post_id === id).map((row) => row.key);
    return json({
      posts: posts.map((row) => ({ ...row, feedback: parseReview(row.feedback), images: imagesOf(row.id) })),
      total: total?.count || 0,
      nextCursor: rows.results.length > PAGE_SIZE ? `${last.updated_at}:${last.id}` : null,
    });
  });
}
