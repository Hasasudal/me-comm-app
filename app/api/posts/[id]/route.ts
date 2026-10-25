import { z } from 'zod';
import {
  checkAuthorName,
  checkPrefix,
  checkPostPassword,
  db,
  editSchema,
  handle,
  HttpError,
  input,
  isAdmin,
  json,
  limit,
  parseReview,
  passwordField,
  publicPost,
  recruitmentValues,
  requireMember,
  seesWriters,
  visiblePost,
  writerOf,
} from '../../../../lib/server';
import { attachImages, checkImages, deletePostImages, postImages } from '../../../../lib/images';
import { clubFor } from '../../../../lib/clubs';
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
    await limit(request, 'post-edit', 20, member.userId);
    const admin = isAdmin(member);
    const data = editSchema.parse(await input(request));
    const { id } = await context.params;
    const post = await visiblePost(id, member);
    await checkPostPassword(request, post, data.password, member);
    // The editor's role decides; an unchanged name stays, so a password co-editor can still fix a staff-signed post.
    if (data.author_name !== post.author_name) checkAuthorName(data.author_name, member);
    if (data.prefix !== post.prefix) checkPrefix(data.prefix, member);
    const news = post.category === 'news';
    if (news && post.status === 'rejected' && !admin)
      throw new HttpError(409, '반려된 기사는 수정할 수 없어요. 새 기사로 작성해주세요.');
    // A writer's change to news sends it back for review and clears the previous feedback; an admin (the reviewer)
    // fixing it keeps the review result. Marks point at character offsets, so a body change drops them but keeps the note.
    const review = news && !admin;
    const status = review ? 'pending' : news ? post.status : 'published';
    const kept = parseReview(post.feedback);
    const feedback = review
      ? null
      : kept && data.content !== post.content
        ? JSON.stringify({ ...kept, marks: [] })
        : post.feedback;
    const [recruitmentStatus, deadline, headcount, roles] = recruitmentValues(data, post.category);
    // Older club posts made before clubs existed may stay unassigned until someone picks one.
    const clubId =
      post.category === 'clubs' && !data.club_id && !post.club_id
        ? null
        : await clubFor(post.category, data.club_id || post.club_id);
    await checkImages(data.images, member.userId, await postImages(id));
    await db()
      .prepare(
        "UPDATE posts SET title=?,content=?,author_name=?,prefix=?,club_id=?,status=?,feedback=?,recruitment_status=?,deadline=?,headcount=?,roles=?,updated_at=?,reviewed_at=CASE WHEN ?='pending' THEN NULL ELSE reviewed_at END WHERE id=?",
      )
      .bind(
        data.title,
        data.content,
        data.author_name,
        data.prefix,
        clubId,
        status,
        feedback,
        recruitmentStatus,
        deadline,
        headcount,
        roles,
        Date.now(),
        status,
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
