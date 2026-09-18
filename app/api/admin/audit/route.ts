import { db, handle, json, requireAdmin } from '../../../../lib/server';

export const dynamic = 'force-dynamic';

// The 50 latest role and status changes, newest first.
export async function GET(request: Request) {
  return handle(async () => {
    await requireAdmin(request);
    const rows = await db()
      .prepare(
        'SELECT id,actor_name,target_name,target_email,action,before,after,created_at FROM member_audit ORDER BY created_at DESC, id DESC LIMIT 50',
      )
      .all();
    return json({ entries: rows.results });
  });
}
