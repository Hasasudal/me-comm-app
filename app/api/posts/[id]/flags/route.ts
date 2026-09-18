import { z } from 'zod';
import {
  db,
  handle,
  HttpError,
  input,
  isAdmin,
  json,
  privateCategories,
  requireMember,
  visiblePost,
} from '../../../../../lib/server';

type Context = { params: Promise<{ id: string }> };
export const dynamic = 'force-dynamic';
const flagsSchema = z.object({ resolved: z.boolean().optional(), pinned: z.boolean().optional() });

// Q&A askers (and admins) mark questions resolved; only admins pin posts to the top of a board.
export async function POST(request: Request, context: Context) {
  return handle(async () => {
    const member = await requireMember(request);
    const admin = await isAdmin(member.userId);
    const flags = flagsSchema.parse(await input(request));
    const { id } = await context.params;
    const post = await visiblePost(id, member, admin);
    const now = Date.now();
    if (flags.resolved !== undefined) {
      if (post.category !== 'qna') throw new HttpError(400, '학사 Q&A 질문만 해결 표시를 할 수 있습니다.');
      if (!admin && post.author_id !== member.userId)
        throw new HttpError(403, '질문한 사람이나 관리자만 해결 표시를 바꿀 수 있습니다.');
      await db()
        .prepare('UPDATE posts SET resolved_at=? WHERE id=?')
        .bind(flags.resolved ? now : null, id)
        .run();
    }
    if (flags.pinned !== undefined) {
      if (!admin) throw new HttpError(403, '관리자만 글을 고정할 수 있습니다.');
      if (privateCategories.includes(post.category)) throw new HttpError(400, '비공개 글은 고정할 수 없습니다.');
      await db()
        .prepare('UPDATE posts SET pinned_at=? WHERE id=?')
        .bind(flags.pinned ? now : null, id)
        .run();
    }
    return json({ ok: true });
  });
}
