import { z } from 'zod';
import { db, handle, HttpError, input, json, requireAdmin } from '../../../../../lib/server';
import { clubNameField } from '../../../../../lib/clubs';

type Context = { params: Promise<{ id: string }> };
export const dynamic = 'force-dynamic';

// Admins approve a request or rename a club.
export async function PATCH(request: Request, context: Context) {
  return handle(async () => {
    await requireAdmin(request);
    const { id } = await context.params;
    const change = z
      .object({ status: z.literal('active').optional(), name: clubNameField.optional() })
      .refine((value) => value.status || value.name, '바꿀 내용을 선택해주세요.')
      .parse(await input(request));
    if (change.name) {
      const taken = await db().prepare('SELECT 1 FROM clubs WHERE name=? AND id<>?').bind(change.name, id).first();
      if (taken) throw new HttpError(409, '이미 있거나 신청된 동아리 이름입니다.');
    }
    const result = await db()
      .prepare('UPDATE clubs SET status=COALESCE(?,status),name=COALESCE(?,name) WHERE id=?')
      .bind(change.status ?? null, change.name ?? null, id)
      .run();
    if (!result.meta.changes) throw new HttpError(404, '동아리를 찾을 수 없습니다.');
    return json({ ok: true });
  });
}
// Rejects a pending request or removes a club. Clubs that still hold posts stay, so no post loses its club.
export async function DELETE(request: Request, context: Context) {
  return handle(async () => {
    await requireAdmin(request);
    await input(request); // same-origin check
    const { id } = await context.params;
    const used = await db().prepare('SELECT 1 FROM posts WHERE club_id=? LIMIT 1').bind(id).first();
    if (used) throw new HttpError(409, '글이 남아 있는 동아리는 삭제할 수 없습니다.');
    const result = await db().prepare('DELETE FROM clubs WHERE id=?').bind(id).run();
    if (!result.meta.changes) throw new HttpError(404, '동아리를 찾을 수 없습니다.');
    return json({ ok: true });
  });
}
