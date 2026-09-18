import {
  commentSchema,
  db,
  handle,
  HttpError,
  input,
  isAdmin,
  json,
  limit,
  requireMember,
  visiblePost,
} from '../../../../../lib/server';

type Context = { params: Promise<{ id: string }> };
type CommentRow = { id: string; author_id: string; author_name: string; content: string; created_at: number };
export const dynamic = 'force-dynamic';

// Comments exist only on public boards; news talks happen through review feedback.
async function commentablePost(request: Request, context: Context) {
  const member = await requireMember(request);
  const admin = await isAdmin(member.userId);
  const { id } = await context.params;
  const post = await visiblePost(id, member, admin);
  if (post.category === 'news') throw new HttpError(400, '학과 뉴스에는 댓글을 달 수 없습니다.');
  return { member, admin, post };
}

export async function GET(request: Request, context: Context) {
  return handle(async () => {
    const { member, admin, post } = await commentablePost(request, context);
    const rows = await db()
      .prepare(
        'SELECT id,author_id,author_name,content,created_at FROM comments WHERE post_id=? ORDER BY created_at ASC, id ASC',
      )
      .bind(post.id)
      .all<CommentRow>();
    return json({
      comments: rows.results.map(({ author_id, ...comment }) => ({
        ...comment,
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
    return json({ comment: { ...comment, deletable: true } }, 201);
  });
}
