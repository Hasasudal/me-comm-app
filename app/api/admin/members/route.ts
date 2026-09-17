import { db, handle, json, requireAdmin } from '../../../../lib/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return handle(async () => {
    await requireAdmin(request);
    const result = await db()
      .prepare('SELECT user_id,email,display_name,joined_at,revoked_at FROM admin_users ORDER BY joined_at ASC')
      .all<{ revoked_at: number | null }>();
    return json({
      members: result.results.filter((member) => !member.revoked_at),
      revoked: result.results.filter((member) => member.revoked_at),
    });
  });
}
