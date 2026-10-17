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
    // Checked inside each statement, so two admins demoting each other at once cannot leave none.
    const guard = losesAdmin ? "(SELECT COUNT(*) FROM users WHERE role='admin' AND status='active' AND id<>?)>=1" : '1';
    const guardArgs = losesAdmin ? [userId] : [];
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
            `INSERT INTO member_audit (id,actor_id,actor_name,target_id,target_name,target_email,action,before,after,created_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE ${guard}`,
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
            ...guardArgs,
          ),
      );
    const results = await db().batch([
      db()
        .prepare(
          `UPDATE users SET status=?,role=?,suspended_at=CASE WHEN ?=status THEN suspended_at WHEN ?='suspended' THEN ? ELSE NULL END,updated_at=? WHERE id=? AND ${guard}`,
        )
        .bind(status, role, status, status, now, now, userId, ...guardArgs),
      ...audit,
      ...(change.status === 'suspended'
        ? [
            db()
              .prepare(`DELETE FROM sessions WHERE user_id=? AND ${guard}`)
              .bind(userId, ...guardArgs),
          ]
        : []),
    ]);
    if (!results[0].meta.changes)
      throw losesAdmin
        ? new HttpError(409, '마지막 관리자의 직책은 바꾸거나 정지할 수 없습니다.')
        : new HttpError(404, '회원을 찾을 수 없습니다.');
    return json({ ok: true, status, role });
  });
}

// Turning down an unverified sign-up drops the row instead of suspending it, so whoever really owns that mailbox
// can still verify it and join later. Only 'pending' rows qualify; active members are suspended through PATCH.
export async function DELETE(request: Request, context: { params: Promise<{ userId: string }> }) {
  return handle(async () => {
    const current = await requireAdmin(request);
    const { userId } = await context.params;
    await input(request);
    const results = await db().batch([
      db()
        .prepare(
          "INSERT INTO member_audit (id,actor_id,actor_name,target_id,target_name,target_email,action,before,after,created_at) SELECT ?,?,?,id,display_name,email,'status','pending','rejected',? FROM users WHERE id=? AND status='pending'",
        )
        .bind(crypto.randomUUID(), current.userId, current.displayName, Date.now(), userId),
      db()
        .prepare("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE id=? AND status='pending')")
        .bind(userId),
      db().prepare("DELETE FROM users WHERE id=? AND status='pending'").bind(userId),
    ]);
    if (!results[2].meta.changes) throw new HttpError(404, '승인 대기 중인 회원을 찾을 수 없습니다.');
    return json({ ok: true });
  });
}
