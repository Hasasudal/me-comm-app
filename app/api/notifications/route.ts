import { db, handle, json, requireMember } from '../../../lib/server';

export const dynamic = 'force-dynamic';

// The 20 latest comments other members left on my posts.
export async function GET(request: Request) {
  return handle(async () => {
    const member = await requireMember(request);
    const rows = await db()
      .prepare(
        'SELECT comments.id,comments.post_id,posts.title,comments.author_name,substr(comments.content,1,80) AS excerpt,comments.created_at FROM comments JOIN posts ON posts.id=comments.post_id WHERE posts.author_id=? AND comments.author_id<>? ORDER BY comments.created_at DESC LIMIT 20',
      )
      .bind(member.userId, member.userId)
      .all();
    return json({ replies: rows.results });
  });
}
