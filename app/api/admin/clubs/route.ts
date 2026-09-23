import { db, handle, json, requireAdmin } from '../../../../lib/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return handle(async () => {
    await requireAdmin(request);
    const rows = await db()
      .prepare(
        "SELECT clubs.id,clubs.name,clubs.status,clubs.created_at,users.display_name AS requested_by_name,(SELECT COUNT(*) FROM posts WHERE posts.club_id=clubs.id) AS post_count FROM clubs LEFT JOIN users ON users.id=clubs.requested_by ORDER BY (clubs.status='pending') DESC, clubs.name",
      )
      .all();
    return json({ clubs: rows.results });
  });
}
