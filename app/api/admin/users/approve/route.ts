import { z } from 'zod';
import { db, handle, input, json, requireAdmin } from '../../../../../lib/server';

export const dynamic = 'force-dynamic';

// Bulk form of PATCH {status:'active'} for sign-ups: same status change, same audit rows, pending users only.
export async function POST(request: Request) {
  return handle(async () => {
    const current = await requireAdmin(request);
    const { userIds } = z
      .object({ userIds: z.array(z.string().min(1).max(100)).min(1, '승인할 회원을 선택해주세요.').max(50, '한 번에 50명까지 승인할 수 있어요.') })
      .parse(await input(request));
    const ids = [...new Set(userIds)];
    const marks = ids.map(() => '?').join(',');
    const now = Date.now();
    const results = await db().batch([
      db()
        .prepare(
          `INSERT INTO member_audit (id,actor_id,actor_name,target_id,target_name,target_email,action,before,after,created_at) SELECT lower(hex(randomblob(16))),?,?,id,display_name,email,'status','pending','active',? FROM users WHERE id IN (${marks}) AND status='pending'`,
        )
        .bind(current.userId, current.displayName, now, ...ids),
      db()
        .prepare(
          `UPDATE users SET status='active',suspended_at=NULL,updated_at=? WHERE id IN (${marks}) AND status='pending'`,
        )
        .bind(now, ...ids),
    ]);
    return json({ ok: true, approved: results[1].meta.changes });
  });
}
