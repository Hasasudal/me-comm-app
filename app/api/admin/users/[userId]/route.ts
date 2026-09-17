import { z } from 'zod';
import { db, handle, HttpError, input, json, requireAdmin } from '../../../../../lib/server';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, context: { params: Promise<{ userId: string }> }) {
  return handle(async () => {
    const current = await requireAdmin(request);
    const { userId } = await context.params;
    const { status } = z.object({ status: z.enum(['active', 'suspended']) }).parse(await input(request));
    if (status === 'suspended' && userId === current.userId)
      throw new HttpError(400, '현재 사용 중인 관리자 계정은 정지할 수 없습니다.');
    const target = await db()
      .prepare('SELECT id,status FROM users WHERE id=?')
      .bind(userId)
      .first<{ id: string; status: string }>();
    if (!target) throw new HttpError(404, '회원을 찾을 수 없습니다.');
    if (status === 'suspended') {
      const targetAdmin = await db()
        .prepare('SELECT user_id FROM admin_users WHERE user_id=? AND revoked_at IS NULL')
        .bind(userId)
        .first();
      if (targetAdmin) {
        const count = await db()
          .prepare('SELECT COUNT(*) AS count FROM admin_users WHERE revoked_at IS NULL')
          .first<{ count: number }>();
        if ((count?.count || 0) <= 1) throw new HttpError(409, '마지막 활성 관리자는 정지할 수 없습니다.');
      }
    }
    const now = Date.now();
    await db().batch([
      db()
        .prepare('UPDATE users SET status=?,suspended_at=?,updated_at=? WHERE id=?')
        .bind(status, status === 'suspended' ? now : null, now, userId),
      ...(status === 'suspended' ? [db().prepare('DELETE FROM sessions WHERE user_id=?').bind(userId)] : []),
    ]);
    return json({ ok: true, status });
  });
}
