import {
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
  visiblePost,
} from '../../../../../lib/server';

type Context = { params: Promise<{ id: string }> };
type CommentRow = {
  id: string;
  author_id: string;
  author_name: string;
  content: string;
  created_at: number;
  role: string | null;
};
// Staff comments show the writer's role so official answers stand out.
const badge = (role: string | null) => (role && role !== 'member' ? role : null);
export const dynamic = 'force-dynamic';

// Comments exist only on public boards; news talks happen through review feedback.
async function commentablePost(request: Request, context: Context) {
  const member = await requireMember(request);
  const admin = isAdmin(member);
  const { id } = await context.params;
  const post = await visiblePost(id, member);
  if (post.category === 'news') throw new HttpError(400, '학과 뉴스에는 댓글을 달 수 없습니다.');
  return { member, admin, post };
}

export async function GET(request: Request, context: Context) {
  return handle(async () => {
    const { member, admin, post } = await commentablePost(request, context);
    const rows = await db()
      .prepare(
        'SELECT comments.id,comments.author_id,comments.author_name,comments.content,comments.created_at,users.role FROM comments LEFT JOIN users ON users.id=comments.author_id WHERE comments.post_id=? ORDER BY comments.created_at ASC, comments.id ASC',
      )
      .bind(post.id)
      .all<CommentRow>();
    return json({
      comments: rows.results.map(({ author_id, role, ...comment }) => ({
        ...comment,
        role: badge(role),
        deletable: admin || author_id === member.userId,
      })),
    });
  });
}

export async function POST(request: Request, context: Context) {
  return handle(async () => {
    const { member, post } = await commentablePost(request, context);
    const data = commentSchema.parse(await input(request));
    await limit(request, 'comment', 20, member.userId);
    const comment = {
      id: crypto.randomUUID(),
      author_name: data.author_name,
      content: data.content,
      created_at: Date.now(),
    };
    await db()
      .prepare('INSERT INTO comments (id,post_id,author_id,author_name,content,created_at) VALUES (?,?,?,?,?,?)')
      .bind(comment.id, post.id, member.userId, comment.author_name, comment.content, comment.created_at)
      .run();
    // A desk post is answered once its staff reply, and waits again when the asker follows up.
    if (deskCategories.includes(post.category)) {
      const asker = post.author_id === member.userId;
      if (asker || managesDesk(member, post.category))
        await db()
          .prepare('UPDATE posts SET resolved_at=? WHERE id=?')
          .bind(asker ? null : comment.created_at, post.id)
          .run();
    }
    return json({ comment: { ...comment, role: badge(member.role), deletable: true } }, 201);
  });
}
