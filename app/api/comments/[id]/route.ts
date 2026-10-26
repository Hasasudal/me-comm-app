import {
  commentSchema,
  db,
  deskCategories,
  deskRoles,
  handle,
  HttpError,
  input,
  isAdmin,
  json,
  limit,
  requireMember,
  visiblePost,
} from '../../../../lib/server';

export const dynamic = 'force-dynamic';

// Only the author edits, admins included; resolved_at is left alone so an edit never changes a desk post's answered state.
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const member = await requireMember(request);
    const { content } = commentSchema.pick({ content: true }).parse(await input(request));
    const { id } = await context.params;
    const comment = await db()
      .prepare('SELECT author_id,post_id FROM comments WHERE id=?')
      .bind(id)
      .first<{ author_id: string; post_id: string }>();
    if (!comment) throw new HttpError(404, '댓글을 찾을 수 없어요. 이미 삭제됐을 수 있어요.');
    if (comment.author_id !== member.userId) throw new HttpError(403, '내가 쓴 댓글만 고칠 수 있어요.');
    await visiblePost(comment.post_id, member);
    await limit(request, 'comment', 20, member.userId);
    await limit(request, 'comment-day', 300, member.userId, 86400000);
    const edited_at = Date.now();
    await db().prepare('UPDATE comments SET content=?,edited_at=? WHERE id=?').bind(content, edited_at, id).run();
    return json({ comment: { id, content, edited_at } });
  });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const member = await requireMember(request);
    await input(request);
    const { id } = await context.params;
    const comment = await db()
      .prepare('SELECT comments.author_id,comments.post_id,posts.category FROM comments JOIN posts ON posts.id=comments.post_id WHERE comments.id=?')
      .bind(id)
      .first<{ author_id: string; post_id: string; category: string }>();
    if (!comment) throw new HttpError(404, '댓글을 찾을 수 없어요. 이미 삭제됐을 수 있어요.');
    if (comment.author_id !== member.userId && !isAdmin(member))
      throw new HttpError(403, '내가 쓴 댓글만 삭제할 수 있어요.');
    const remove = db().prepare('DELETE FROM comments WHERE id=?').bind(id);
    if (!deskCategories.includes(comment.category)) {
      await remove.run();
      return json({ ok: true });
    }
    // Same rule as posting: the latest reply from the asker or the desk's staff decides whether the post is answered;
    // interim staff replies (resolves=0) don't count.
    await db().batch([
      remove,
      db()
        .prepare(
          "UPDATE posts SET resolved_at=(SELECT CASE WHEN comments.author_id=posts.author_id THEN NULL ELSE comments.created_at END FROM comments LEFT JOIN users ON users.id=comments.author_id WHERE comments.post_id=posts.id AND (comments.author_id=posts.author_id OR (users.role IN ('admin',?) AND comments.resolves=1)) ORDER BY comments.created_at DESC, comments.id DESC LIMIT 1) WHERE id=?",
        )
        .bind(deskRoles[comment.category], comment.post_id),
    ]);
    return json({ ok: true });
  });
}
