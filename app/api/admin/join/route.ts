import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { verifyAdminCode } from '../../../../lib/admin-code';
import { db, handle, HttpError, input, json, limit, requireMember } from '../../../../lib/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireMember(request);
    const { code } = z
      .object({
        code: z.string().trim().min(12, '관리자 코드를 확인해주세요.').max(128, '관리자 코드를 확인해주세요.'),
      })
      .parse(await input(request));
    const hash = env.ADMIN_JOIN_CODE_HASH?.trim(),
      salt = env.ADMIN_JOIN_CODE_SALT?.trim();
    if (!hash || !salt) throw new HttpError(503, '관리자 코드가 아직 설정되지 않았습니다.');
    await limit(request, 'admin-join', 5, user.userId);
    const previous = await db()
      .prepare('SELECT revoked_at FROM admin_users WHERE user_id=?')
      .bind(user.userId)
      .first<{ revoked_at: number | null }>();
    if (previous?.revoked_at)
      throw new HttpError(403, '관리자 권한이 회수된 계정입니다. 다른 관리자에게 복구를 요청해주세요.');
    if (!(await verifyAdminCode(code, salt, hash))) throw new HttpError(403, '관리자 코드가 일치하지 않습니다.');
    const now = Date.now();
    await db()
      .prepare(
        'INSERT INTO admin_users (user_id,email,display_name,joined_at,revoked_at) VALUES (?,?,?,?,NULL) ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,display_name=excluded.display_name,revoked_at=NULL',
      )
      .bind(user.userId, user.email, user.displayName, now)
      .run();
    return json({ ok: true }, 201);
  });
}
