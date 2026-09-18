import { db, handle, HttpError, input, isAdmin, json, requireMember } from '../../../../lib/server';

export const dynamic = 'force-dynamic';

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const member = await requireMember(request);
    await input(request);
    const { id } = await context.params;
    const comment = await db()
      .prepare('SELECT author_id FROM comments WHERE id=?')
      .bind(id)
      .first<{ author_id: string }>();
    if (!comment) throw new HttpError(404, '댓글을 찾을 수 없습니다.');
    if (comment.author_id !== member.userId && !isAdmin(member))
      throw new HttpError(403, '내가 쓴 댓글만 삭제할 수 있습니다.');
    await db().prepare('DELETE FROM comments WHERE id=?').bind(id).run();
    return json({ ok: true });
  });
}
