import { z } from 'zod';
import { db, handle, HttpError, input, json, requireAdmin, roles } from '../../../../../lib/server';

export const dynamic = 'force-dynamic';

// Admins suspend or restore members and assign their role (일반·학사·학생회·관리자).
export async function PATCH(request: Request, context: { params: Promise<{ userId: string }> }) {
  return handle(async () => {
    const current = await requireAdmin(request);
    const { userId } = await context.params;
    const change = z
      .object({
        status: z.enum(['active', 'suspended']).optional(),
        role: z.enum(roles as [string, ...string[]]).optional(),
      })
      .refine((value) => value.status || value.role, '바꿀 내용을 선택해주세요.')
      .parse(await input(request));
    if (userId === current.userId && (change.status === 'suspended' || (change.role && change.role !== 'admin')))
      throw new HttpError(400, '내 계정의 관리자 직책은 직접 바꾸거나 정지할 수 없습니다.');
    const target = await db()
      .prepare('SELECT id,email,display_name,status,role FROM users WHERE id=?')
      .bind(userId)
      .first<{ id: string; email: string; display_name: string; status: string; role: string }>();
    if (!target) throw new HttpError(404, '회원을 찾을 수 없습니다.');
    const losesAdmin =
      target.role === 'admin' && (change.status === 'suspended' || (change.role && change.role !== 'admin'));
    if (losesAdmin) {
      const count = await db()
        .prepare("SELECT COUNT(*) AS count FROM users WHERE role='admin' AND status='active'")
        .first<{ count: number }>();
      if ((count?.count || 0) <= 1) throw new HttpError(409, '마지막 관리자의 직책은 바꾸거나 정지할 수 없습니다.');
    }
    const status = change.status || target.status;
    const role = change.role || target.role;
    const now = Date.now();
    // Every real change is recorded with who made it, so role and suspension history can be traced.
    const audit = (
      [
        ['role', target.role, role],
        ['status', target.status, status],
      ] as const
    )
      .filter(([, before, after]) => before !== after)
      .map(([action, before, after]) =>
        db()
          .prepare(
            'INSERT INTO member_audit (id,actor_id,actor_name,target_id,target_name,target_email,action,before,after,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
          )
          .bind(
            crypto.randomUUID(),
            current.userId,
            current.displayName,
            target.id,
            target.display_name,
            target.email,
            action,
            before,
            after,
            now,
          ),
      );
    await db().batch([
      ...audit,
      db()
        .prepare(
          "UPDATE users SET status=?,role=?,suspended_at=CASE WHEN ?=status THEN suspended_at WHEN ?='suspended' THEN ? ELSE NULL END,updated_at=? WHERE id=?",
        )
        .bind(status, role, status, status, now, now, userId),
      ...(change.status === 'suspended' ? [db().prepare('DELETE FROM sessions WHERE user_id=?').bind(userId)] : []),
    ]);
    return json({ ok: true, status, role });
  });
}
