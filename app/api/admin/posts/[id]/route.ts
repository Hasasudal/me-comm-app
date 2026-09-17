import { z } from 'zod';
import {
  authorFields,
  contentFields,
  db,
  handle,
  HttpError,
  input,
  json,
  markSchema,
  requireAdmin,
} from '../../../../../lib/server';
export const dynamic = 'force-dynamic';
const note = z.string().trim().max(2000, '피드백은 2,000자 이내로 입력해주세요.');
const commandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve'), updated_at: z.number() }),
  z.object({ action: z.literal('edit'), ...contentFields, prefix: authorFields.prefix, updated_at: z.number() }),
  z.object({
    action: z.literal('feedback'),
    note,
    marks: z.array(markSchema).max(200, '표시는 200개까지 남길 수 있습니다.'),
    updated_at: z.number(),
  }),
  z.object({ action: z.literal('reject'), note: note.min(1, '반려 사유를 입력해주세요.'), updated_at: z.number() }),
]);
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireAdmin(request);
    const command = commandSchema.parse(await input(request));
    const { id } = await context.params;
    const post = await db()
      .prepare("SELECT content FROM posts WHERE id=? AND category='news' AND status='pending'")
      .bind(id)
      .first<{ content: string }>();
    if (!post) throw new HttpError(409, '이미 처리되었거나 찾을 수 없는 기사입니다. 목록을 새로고침해주세요.');
    const now = Date.now(),
      guard = "WHERE id=? AND category='news' AND status='pending' AND updated_at=?";
    let statement;
    if (command.action === 'approve')
      statement = db()
        .prepare(`UPDATE posts SET status='published',feedback=NULL,updated_at=? ${guard}`)
        .bind(now, id, command.updated_at);
    else if (command.action === 'edit')
      statement = db()
        .prepare(`UPDATE posts SET title=?,content=?,prefix=?,updated_at=? ${guard}`)
        .bind(command.title, command.content, command.prefix, now, id, command.updated_at);
    else if (command.action === 'feedback') {
      if (!command.note && !command.marks.length)
        throw new HttpError(400, '피드백 내용이나 표시를 하나 이상 남겨주세요.');
      if (command.marks.some((mark) => mark.end > post.content.length))
        throw new HttpError(400, '표시 범위가 본문을 벗어났습니다.');
      statement = db()
        .prepare(`UPDATE posts SET status='feedback',feedback=?,updated_at=? ${guard}`)
        .bind(JSON.stringify({ note: command.note, marks: command.marks }), now, id, command.updated_at);
    } else
      statement = db()
        .prepare(`UPDATE posts SET status='rejected',feedback=?,updated_at=? ${guard}`)
        .bind(JSON.stringify({ note: command.note, marks: [] }), now, id, command.updated_at);
    const result = await statement.run();
    if (!result.meta.changes) throw new HttpError(409, '다른 작업으로 글이 변경되었습니다. 목록을 새로고침해주세요.');
    return json({ ok: true });
  });
}
