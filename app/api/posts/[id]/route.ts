import { z } from 'zod';
import {
  checkPostPassword,
  db,
  editSchema,
  handle,
  HttpError,
  input,
  isAdmin,
  json,
  passwordField,
  publicPost,
  recruitmentValues,
  requireMember,
  seesWriters,
  visiblePost,
  writerOf,
} from '../../../../lib/server';
import { attachImages, checkImages, deletePostImages, postImages } from '../../../../lib/images';
type Context = { params: Promise<{ id: string }> };
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: Context) {
  return handle(async () => {
    const member = await requireMember(request);
    const { id } = await context.params;
    const post = await visiblePost(id, member);
    return json({
      post: {
        ...publicPost(post),
        mine: post.author_id === member.userId,
        images: await postImages(id),
        ...(seesWriters(member, post.category) ? { writer: await writerOf(post.author_id) } : {}),
      },
    });
  });
}
export async function PATCH(request: Request, context: Context) {
  return handle(async () => {
    const member = await requireMember(request);
    const admin = isAdmin(member);
    const data = editSchema.parse(await input(request));
    const { id } = await context.params;
    const post = await visiblePost(id, member);
    await checkPostPassword(request, post, data.password, member);
    const news = post.category === 'news';
    if (news && post.status === 'rejected' && !admin)
      throw new HttpError(409, '반려된 기사는 수정할 수 없습니다. 새 기사로 작성해주세요.');
    // Any change to news sends it back for review and clears the previous feedback.
    const status = news ? 'pending' : 'published';
    const feedback = news ? null : post.feedback;
    const [recruitmentStatus, deadline, headcount, roles] = recruitmentValues(data, post.category);
    await checkImages(data.images, member.userId, await postImages(id));
    await db()
      .prepare(
        'UPDATE posts SET title=?,content=?,author_name=?,prefix=?,status=?,feedback=?,recruitment_status=?,deadline=?,headcount=?,roles=?,updated_at=? WHERE id=?',
      )
      .bind(
        data.title,
        data.content,
        data.author_name,
        data.prefix,
        status,
        feedback,
        recruitmentStatus,
        deadline,
        headcount,
        roles,
        Date.now(),
        id,
      )
      .run();
    await attachImages(id, data.images, member.userId);
    return json({ ok: true, status });
  });
}
export async function DELETE(request: Request, context: Context) {
  return handle(async () => {
    const member = await requireMember(request);
    const { password } = z.object({ password: passwordField.optional() }).parse(await input(request));
    const { id } = await context.params;
    const post = await visiblePost(id, member);
    await checkPostPassword(request, post, password, member);
    await deletePostImages([id]);
    await db().batch([
      db().prepare('DELETE FROM comments WHERE post_id=?').bind(id),
      db().prepare('DELETE FROM posts WHERE id=?').bind(id),
    ]);
    return json({ ok: true });
  });
}
