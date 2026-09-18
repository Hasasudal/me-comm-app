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
const flagsSchema = z.object({ pinned: z.boolean() });

// Admins pin public posts to the top of their board.
export async function POST(request: Request, context: Context) {
  return handle(async () => {
    const member = await requireMember(request);
    const admin = isAdmin(member);
    const flags = flagsSchema.parse(await input(request));
    const { id } = await context.params;
    const post = await visiblePost(id, member);
    if (!admin) throw new HttpError(403, '관리자만 글을 고정할 수 있습니다.');
    if (privateCategories.includes(post.category)) throw new HttpError(400, '비공개 글은 고정할 수 없습니다.');
    await db()
      .prepare('UPDATE posts SET pinned_at=? WHERE id=?')
      .bind(flags.pinned ? Date.now() : null, id)
      .run();
    return json({ ok: true });
  });
}
