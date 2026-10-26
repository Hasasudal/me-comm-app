import { z } from 'zod';
import { requireConfigured, siteOrigin } from '../../../../../../lib/newsletter';
import { SCHEDULE_ERROR, validScheduleTime } from '../../../../../../lib/schedule';
import { db, handle, HttpError, input, json, limit, requireAdmin } from '../../../../../../lib/server';

export const dynamic = 'force-dynamic';

// Only before sending started: no delivery rows yet and not marked sent (a newsletter with no subscribers is).
const unstarted =
  'id=?1 AND sent_at IS NULL AND started_at IS NULL AND NOT EXISTS (SELECT 1 FROM newsletter_deliveries WHERE newsletter_id=?1)';
// Cancelling also works after the cron started: sent mails stay sent, the rest waits for a manual resume.
const cancellable = 'id=?1 AND sent_at IS NULL AND scheduled_at IS NOT NULL';
async function refuse(id: string) {
  const exists = await db().prepare('SELECT 1 FROM newsletters WHERE id=?').bind(id).first();
  return exists
    ? new HttpError(409, '예약을 바꿀 수 없는 뉴스레터예요. 이미 발송했거나 예약이 없어요.')
    : new HttpError(404, '뉴스레터를 찾을 수 없어요.');
}

// { at } in UTC ms. The cron (worker/index.ts) sends it within 10 minutes after `at`, building unsubscribe links
// from this request's origin.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const admin = await requireAdmin(request);
    const { id } = await context.params;
    const { at } = z.object({ at: z.unknown() }).parse(await input(request));
    requireConfigured();
    await limit(request, 'newsletter-schedule', 30, admin.userId);
    if (!validScheduleTime(at)) throw new HttpError(400, SCHEDULE_ERROR);
    const result = await db()
      .prepare(
        `UPDATE newsletters SET scheduled_at=?2,scheduled_by=?3,scheduled_by_name=?4,site_origin=?5 WHERE ${unstarted}`,
      )
      .bind(id, at, admin.userId, admin.displayName, siteOrigin(request))
      .run();
    if (!result.meta.changes) throw await refuse(id);
    return json({ ok: true, scheduled_at: at });
  });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const admin = await requireAdmin(request);
    const { id } = await context.params;
    await input(request);
    await limit(request, 'newsletter-schedule', 30, admin.userId);
    const result = await db()
      .prepare(`UPDATE newsletters SET scheduled_at=NULL,scheduled_by=NULL,scheduled_by_name=NULL WHERE ${cancellable}`)
      .bind(id)
      .run();
    if (!result.meta.changes) throw await refuse(id);
    return json({ ok: true });
  });
}
