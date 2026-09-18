import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { verifyFirebaseIdToken } from '../../../lib/firebase-token';
import { expiredSessionCookie, requireMember, revokeMemberSessions } from '../../../lib/member-auth';
import { db, handle, HttpError, input, json } from '../../../lib/server';
import { deletePostImages } from '../../../lib/images';

export const dynamic = 'force-dynamic';
// Firebase uids never take this form, so no account can claim the withdrawn member's content.
const WITHDRAWN_ID = 'withdrawn';
const WITHDRAWN_NAME = '탈퇴한 회원';

export async function PATCH(request: Request) {
  return handle(async () => {
    const member = await requireMember(request);
    const { idToken } = z.object({ idToken: z.string().min(100).max(10000) }).parse(await input(request));
    const projectId = env.FIREBASE_PROJECT_ID?.trim();
    if (!projectId) throw new HttpError(503, '학교 계정 로그인이 아직 설정되지 않았습니다.');
    const verified = await verifyFirebaseIdToken(idToken, { projectId });
    if (verified.userId !== member.userId) throw new HttpError(403, '현재 로그인한 계정과 일치하지 않습니다.');
    const conflict = await db()
      .prepare('SELECT id FROM users WHERE email=? AND id<>?')
      .bind(verified.email, member.userId)
      .first();
    if (conflict) throw new HttpError(409, '이미 다른 계정에서 사용 중인 학교 이메일입니다.');
    const emailChanged = verified.email !== member.email;
    await db()
      .prepare('UPDATE users SET email=?,display_name=?,updated_at=? WHERE id=?')
      .bind(verified.email, verified.displayName, Date.now(), member.userId)
      .run();
    if (emailChanged) await revokeMemberSessions(member.userId);
    return json(
      { ok: true, email: verified.email, displayName: verified.displayName, reauthenticate: emailChanged },
      200,
      emailChanged ? { 'Set-Cookie': expiredSessionCookie() } : undefined,
    );
  });
}

export async function DELETE(request: Request) {
  return handle(async () => {
    const member = await requireMember(request);
    const { confirm, dryRun } = z
      .object({
        confirm: z.literal('회원탈퇴', { errorMap: () => ({ message: '회원탈퇴 확인 문구를 정확히 입력해주세요.' }) }),
        dryRun: z.boolean().optional(),
      })
      .parse(await input(request));
    void confirm;
    if (member.role === 'admin') {
      const count = await db()
        .prepare("SELECT COUNT(*) AS count FROM users WHERE role='admin' AND status='active'")
        .first<{ count: number }>();
      if ((count?.count || 0) <= 1)
        throw new HttpError(409, '마지막 관리자는 다른 회원에게 관리자 직책을 준 뒤 탈퇴할 수 있습니다.');
    }
    if (dryRun) return json({ ok: true });
    // Posts and comments stay for the community, credited to a withdrawn member; unfinished news, inquiries and
    // complaints are dropped (with their photos) and approved news stays for the admin archive.
    const dropped =
      "author_id=? AND (category IN ('inquiry','complaint') OR (category='news' AND status<>'published'))";
    const doomed = await db()
      .prepare(`SELECT id FROM posts WHERE ${dropped}`)
      .bind(member.userId)
      .all<{ id: string }>();
    await deletePostImages(doomed.results.map((row) => row.id));
    await db().batch([
      db().prepare(`DELETE FROM comments WHERE post_id IN (SELECT id FROM posts WHERE ${dropped})`).bind(member.userId),
      db().prepare(`DELETE FROM posts WHERE ${dropped}`).bind(member.userId),
      db()
        .prepare('UPDATE posts SET author_id=?,author_name=? WHERE author_id=?')
        .bind(WITHDRAWN_ID, WITHDRAWN_NAME, member.userId),
      db()
        .prepare('UPDATE comments SET author_id=?,author_name=? WHERE author_id=?')
        .bind(WITHDRAWN_ID, WITHDRAWN_NAME, member.userId),
      db().prepare('DELETE FROM sessions WHERE user_id=?').bind(member.userId),
      db().prepare('DELETE FROM users WHERE id=?').bind(member.userId),
    ]);
    return json({ ok: true }, 200, { 'Set-Cookie': expiredSessionCookie() });
  });
}
