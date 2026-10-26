import { z } from 'zod';
import { db, handle, HttpError, input, json, requireAdmin, visible } from '../../../../../lib/server';
import { clubNameField } from '../../../../../lib/clubs';

type Context = { params: Promise<{ id: string }> };
export const dynamic = 'force-dynamic';

// Admins approve a request or rename a club.
export async function PATCH(request: Request, context: Context) {
  return handle(async () => {
    await requireAdmin(request);
    const { id } = await context.params;
    const change = z
      .object({ status: z.literal('active').optional(), name: clubNameField.refine(...visible).optional() })
      .refine((value) => value.status || value.name, '바꿀 내용을 선택해주세요.')
      .parse(await input(request));
    if (change.name) {
      const taken = await db().prepare('SELECT 1 FROM clubs WHERE name=? AND id<>?').bind(change.name, id).first();
      if (taken) throw new HttpError(409, '이미 있거나 신청된 동아리 이름이에요.');
    }
    const result = await db()
      .prepare('UPDATE clubs SET status=COALESCE(?,status),name=COALESCE(?,name) WHERE id=?')
      .bind(change.status ?? null, change.name ?? null, id)
      .run()
      .catch((e: unknown) => {
        // Two admins renaming at once can slip past the check above; the unique index still decides.
        if (e instanceof Error && e.message.includes('UNIQUE')) throw new HttpError(409, '이미 있거나 신청된 동아리 이름이에요.');
        throw e;
      });
    if (!result.meta.changes) throw new HttpError(404, '동아리를 찾을 수 없어요.');
    return json({ ok: true });
  });
}
// Rejects a pending request or removes a club. Clubs that still hold posts stay, so no post loses its club.
export async function DELETE(request: Request, context: Context) {
  return handle(async () => {
    await requireAdmin(request);
    await input(request); // same-origin check
    const { id } = await context.params;
    // One statement, so a post filed between a check and the delete cannot be orphaned.
    const result = await db()
      .prepare('DELETE FROM clubs WHERE id=? AND NOT EXISTS (SELECT 1 FROM posts WHERE club_id=?)')
      .bind(id, id)
      .run();
    if (!result.meta.changes) {
      const exists = await db().prepare('SELECT 1 FROM clubs WHERE id=?').bind(id).first();
      if (exists) throw new HttpError(409, '글이 남아 있는 동아리는 삭제할 수 없어요.');
      throw new HttpError(404, '동아리를 찾을 수 없어요.');
    }
    return json({ ok: true });
  });
}
