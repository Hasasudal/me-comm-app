import { db, handle, json, requireAdmin } from '../../../../lib/server';

export const dynamic = 'force-dynamic';

// Counts for the admin "오늘 처리할 일" panel.
export async function GET(request: Request) {
  return handle(async () => {
    await requireAdmin(request);
    const [row, next] = await Promise.all([
      db()
        .prepare(
          `SELECT (SELECT COUNT(*) FROM posts WHERE category='news' AND status='pending') AS news,
            (SELECT COUNT(*) FROM users WHERE status='pending') AS members,
            (SELECT COUNT(*) FROM posts WHERE category='inquiry' AND resolved_at IS NULL) AS inquiry,
            (SELECT COUNT(*) FROM posts WHERE category='complaint' AND resolved_at IS NULL) AS complaint`,
        )
        .first<{ news: number; members: number; inquiry: number; complaint: number }>(),
      db()
        .prepare(
          'SELECT subject,scheduled_at FROM newsletters WHERE scheduled_at IS NOT NULL AND started_at IS NULL AND sent_at IS NULL ORDER BY scheduled_at LIMIT 1',
        )
        .first<{ subject: string; scheduled_at: number }>(),
    ]);
    return json({ ...row, newsletter: next ?? null });
  });
}
