import { db, handle, HttpError, input, json, requireAdmin } from '../../../../../lib/server';

export const dynamic = 'force-dynamic';

// Only drafts nobody has received yet (no 'sent' or in-flight 'sending' row) can be deleted.
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireAdmin(request);
    const { id } = await context.params;
    await input(request);
    const untouched =
      "NOT EXISTS (SELECT 1 FROM newsletter_deliveries WHERE newsletter_id=?1 AND status IN ('sent','sending'))";
    const results = await db().batch([
      db().prepare(`DELETE FROM newsletters WHERE id=?1 AND ${untouched}`).bind(id),
      db().prepare('DELETE FROM newsletter_deliveries WHERE newsletter_id=?1 AND NOT EXISTS (SELECT 1 FROM newsletters WHERE id=?1)').bind(id),
    ]);
    if (!results[0].meta.changes) {
      const exists = await db().prepare('SELECT 1 FROM newsletters WHERE id=?').bind(id).first();
      throw exists
        ? new HttpError(409, '이미 발송을 시작한 뉴스레터는 삭제할 수 없습니다.')
        : new HttpError(404, '뉴스레터를 찾을 수 없습니다.');
    }
    return json({ ok: true });
  });
}
