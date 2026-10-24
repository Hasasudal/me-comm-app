import { z } from 'zod';
import {
  db,
  deskCategories,
  handle,
  HttpError,
  input,
  isAdmin,
  managesDesk,
  json,
  privateCategories,
  requireMember,
  visiblePost,
} from '../../../../../lib/server';

type Context = { params: Promise<{ id: string }> };
export const dynamic = 'force-dynamic';
const flagsSchema = z
  .object({ pinned: z.boolean().optional(), resolved: z.boolean().optional() })
  .refine((flags) => flags.pinned !== undefined || flags.resolved !== undefined);

// Admins pin public posts to the top of their board; desk staff mark inquiries/suggestions answered or waiting.
export async function POST(request: Request, context: Context) {
  return handle(async () => {
    const member = await requireMember(request);
    const admin = isAdmin(member);
    const flags = flagsSchema.parse(await input(request));
    const { id } = await context.params;
    const post = await visiblePost(id, member);
    // Check every requested change before writing any, so a refused flag never leaves the other half applied.
    if (flags.resolved !== undefined) {
      if (!deskCategories.includes(post.category))
        throw new HttpError(400, '문의·건의 글만 답변 상태를 바꿀 수 있어요.');
      if (!managesDesk(member, post.category))
        throw new HttpError(403, '이 글을 맡은 담당자만 답변 상태를 바꿀 수 있어요.');
    }
    if (flags.pinned !== undefined) {
      if (!admin) throw new HttpError(403, '관리자만 글을 고정할 수 있습니다.');
      if (privateCategories.includes(post.category)) throw new HttpError(400, '비공개 글은 고정할 수 없습니다.');
    }
    // Pin first: a full board refuses before `resolved` is written. The cap is checked in the same statement
    // as the write (posts/route.ts lists at most 10 pins).
    if (flags.pinned) {
      const pin = await db()
        .prepare(
          'UPDATE posts SET pinned_at=? WHERE id=? AND (pinned_at IS NOT NULL OR (SELECT COUNT(*) FROM posts WHERE pinned_at IS NOT NULL) < 10)',
        )
        .bind(Date.now(), id)
        .run();
      if (!pin.meta.changes) throw new HttpError(409, '고정 글은 10개까지예요. 다른 글의 고정을 먼저 풀어주세요.');
    } else if (flags.pinned === false) await db().prepare('UPDATE posts SET pinned_at=NULL WHERE id=?').bind(id).run();
    if (flags.resolved !== undefined)
      await db()
        .prepare('UPDATE posts SET resolved_at=? WHERE id=?')
        .bind(flags.resolved ? Date.now() : null, id)
        .run();
    return json({ ok: true });
  });
}
