import { z } from 'zod';
import {
  checkAuthorName,
  commentSchema,
  db,
  deskCategories,
  handle,
  HttpError,
  input,
  isAdmin,
  json,
  managesDesk,
  limit,
  requireMember,
  seesWriters,
  visiblePost,
} from '../../../../../lib/server';

type Context = { params: Promise<{ id: string }> };
type CommentRow = {
  id: string;
  author_id: string;
  author_name: string;
  content: string;
  created_at: number;
  edited_at: number | null;
  role: string | null;
  writer_name: string | null;
  writer_email: string | null;
};
// Staff comments show the writer's role so official answers stand out.
const badge = (role: string | null) => (role && role !== 'member' ? role : null);
export const dynamic = 'force-dynamic';
// Creation stops at this many, so listing this many is the whole thread and needs no pages.
const MAX_COMMENTS = 500;

// Comments exist only on public boards; news talks happen through review feedback.
async function commentablePost(request: Request, context: Context) {
  const member = await requireMember(request);
  const admin = isAdmin(member);
  const { id } = await context.params;
  const post = await visiblePost(id, member);
  if (post.category === 'news') throw new HttpError(400, '학과 뉴스에는 댓글을 달 수 없어요.');
  return { member, admin, post };
}

export async function GET(request: Request, context: Context) {
  return handle(async () => {
    const { member, admin, post } = await commentablePost(request, context);
    const rows = await db()
      .prepare(
        'SELECT comments.id,comments.author_id,comments.author_name,comments.content,comments.created_at,comments.edited_at,users.role,users.display_name AS writer_name,users.email AS writer_email FROM comments LEFT JOIN users ON users.id=comments.author_id WHERE comments.post_id=? ORDER BY comments.created_at ASC, comments.id ASC LIMIT ?',
      )
      .bind(post.id, MAX_COMMENTS)
      .all<CommentRow>();
    const writers = seesWriters(member, post.category);
    return json({
      // Staff of this desk get canned answers above the comment box.
      templates: deskCategories.includes(post.category) && managesDesk(member, post.category),
      comments: rows.results.map(({ author_id, role, writer_name, writer_email, ...comment }) => ({
        ...comment,
        role: badge(role),
        deletable: admin || author_id === member.userId,
        editable: author_id === member.userId,
        ...(writers ? { writer: writer_email ? { name: writer_name, email: writer_email } : null } : {}),
      })),
    });
  });
}

export async function POST(request: Request, context: Context) {
  return handle(async () => {
    const { member, post } = await commentablePost(request, context);
    const data = commentSchema.extend({ resolve: z.boolean().optional() }).parse(await input(request));
    checkAuthorName(data.author_name, member);
    await limit(request, 'comment', 20, member.userId);
    await limit(request, 'comment-day', 300, member.userId, 86400000);
    const comment = {
      id: crypto.randomUUID(),
      author_name: data.author_name,
      content: data.content,
      created_at: Date.now(),
    };
    const desk = deskCategories.includes(post.category);
    const asker = post.author_id === member.userId;
    const staff = desk && !asker && managesDesk(member, post.category);
    // Staff can post an interim reply (resolve: false) that leaves the answered state alone.
    const resolves = !staff || data.resolve !== false;
    // The cap and the insert are one statement, so racing requests cannot pass MAX_COMMENTS.
    const inserted = await db()
      .prepare(
        'INSERT INTO comments (id,post_id,author_id,author_name,content,created_at,resolves) SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM comments WHERE post_id=?)<?',
      )
      .bind(
        comment.id,
        post.id,
        member.userId,
        comment.author_name,
        comment.content,
        comment.created_at,
        resolves ? 1 : 0,
        post.id,
        MAX_COMMENTS,
      )
      .run();
    if (!inserted.meta.changes) throw new HttpError(409, '댓글이 너무 많아 더 달 수 없어요.');
    // A desk post is answered once its staff reply, and waits again when the asker follows up.
    if (asker ? desk : staff && resolves)
      await db()
        .prepare('UPDATE posts SET resolved_at=? WHERE id=?')
        .bind(asker ? null : comment.created_at, post.id)
        .run();
    return json({ comment: { ...comment, role: badge(member.role), deletable: true, editable: true, edited_at: null } }, 201);
  });
}
