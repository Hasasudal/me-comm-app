import { db, handle, HttpError, json, requireAdmin, requireMember } from '../../../../lib/server';
import { bucket, cardNewsColumns, cardNewsId, cardNewsKey } from '../../../../lib/card-news';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  return handle(async () => {
    const member = await requireMember(request);
    const { id } = await context.params;
    const item = cardNewsId.safeParse(id).success
      ? await db()
          .prepare(`SELECT ${cardNewsColumns(member)} FROM card_news WHERE id=?`)
          .bind(id)
          .first()
      : null;
    if (!item) throw new HttpError(404, '카드뉴스를 찾을 수 없어요. 삭제되었을 수 있어요.');
    return json({ item });
  });
}

export async function DELETE(request: Request, context: Context) {
  return handle(async () => {
    await requireAdmin(request);
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin)
      throw new HttpError(403, '요청을 처리하지 못했어요. 페이지를 새로고침한 뒤 다시 시도해주세요.');
    const { id } = await context.params;
    if (!cardNewsId.safeParse(id).success) throw new HttpError(404, '카드뉴스를 찾을 수 없어요. 삭제되었을 수 있어요.');
    const result = await db().prepare('DELETE FROM card_news WHERE id=?').bind(id).run();
    if (!result.meta.changes) throw new HttpError(404, '카드뉴스를 찾을 수 없어요. 삭제되었을 수 있어요.');
    await bucket().delete(cardNewsKey(id));
    return json({ ok: true });
  });
}
