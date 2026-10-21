import {
  BATCH,
  newsletterToken,
  quota,
  requireConfigured,
  sendMail,
  Unconfirmed,
  UNCONFIRMED_ERROR,
  unsubscribeUrl,
  withFooter,
} from '../../../../../../lib/newsletter';
import { db, handle, HttpError, input, json, limit, requireAdmin } from '../../../../../../lib/server';

export const dynamic = 'force-dynamic';
const STALE = 5 * 60000;

// Sends the next batch (≤BATCH, within today's quota); the admin page calls this repeatedly until done.
// Rows go pending -> sending (claimed by one atomic UPDATE, so two admins never mail the same person) -> sent/failed.
// A batch goes back to pending only when the script definitely refused it; if the outcome is unknown the rows become
// failed (UNCONFIRMED_ERROR) so nobody is mailed twice; admins check Gmail's 보낸편지함 for those.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const admin = await requireAdmin(request);
    const { id } = await context.params;
    await input(request);
    requireConfigured();
    await limit(request, 'newsletter-send', 30, admin.userId);
    const letter = await db()
      .prepare('SELECT subject,html FROM newsletters WHERE id=?')
      .bind(id)
      .first<{ subject: string; html: string }>();
    if (!letter) throw new HttpError(404, '뉴스레터를 찾을 수 없습니다.');
    const now = Date.now();
    await db().batch([
      // Who started sending, recorded once by the call that snapshots the recipients (runs before the snapshot).
      db()
        .prepare(
          'UPDATE newsletters SET started_by=?2,started_by_name=?3,started_at=?4 WHERE id=?1 AND started_at IS NULL AND sent_at IS NULL AND NOT EXISTS (SELECT 1 FROM newsletter_deliveries WHERE newsletter_id=?1)',
        )
        .bind(id, admin.userId, admin.displayName, now),
      // The first call snapshots the subscribers; later calls add nobody, so nobody can get it twice.
      db()
        .prepare(
          "INSERT OR IGNORE INTO newsletter_deliveries (newsletter_id,user_id,status) SELECT ?1,id,'pending' FROM users WHERE status='active' AND newsletter=1 AND NOT EXISTS (SELECT 1 FROM newsletter_deliveries WHERE newsletter_id=?1) AND EXISTS (SELECT 1 FROM newsletters WHERE id=?1 AND sent_at IS NULL)",
        )
        .bind(id),
      // A worker that died mid-batch leaves 'sending' rows behind; the mail may have gone out, so they become failed.
      db()
        .prepare(
          "UPDATE newsletter_deliveries SET status='failed',sent_at=NULL,error=?3 WHERE newsletter_id=?1 AND status='sending' AND sent_at<?2",
        )
        .bind(id, now - STALE, UNCONFIRMED_ERROR),
      // Members who turned it off, were suspended or left since the snapshot are dropped (not counted as failed).
      db()
        .prepare(
          "DELETE FROM newsletter_deliveries WHERE newsletter_id=?1 AND status='pending' AND user_id NOT IN (SELECT id FROM users WHERE status='active' AND newsletter=1)",
        )
        .bind(id),
    ]);
    const pending = async () =>
      (
        await db()
          .prepare("SELECT COUNT(*) AS count FROM newsletter_deliveries WHERE newsletter_id=? AND status IN ('pending','sending')")
          .bind(id)
          .first<{ count: number }>()
      )?.count ?? 0;
    let remaining = await quota();
    let sent = 0;
    let failed = 0;
    const claimed =
      remaining > 0
        ? (
            await db()
              .prepare(
                "UPDATE newsletter_deliveries SET status='sending',sent_at=?1 WHERE newsletter_id=?2 AND status='pending' AND user_id IN (SELECT user_id FROM newsletter_deliveries WHERE newsletter_id=?2 AND status='pending' LIMIT ?3) RETURNING user_id",
              )
              .bind(now, id, Math.min(BATCH, remaining))
              .all<{ user_id: string }>()
          ).results
        : [];
    if (claimed.length) {
      // The current address is read now (not at snapshot time), and only for members still active and subscribed.
      // Existing members subscribed by default have no token yet; it is made the first time they are mailed.
      const users = await db().batch<{ newsletter_token: string; email: string }>(
        claimed.map((row) =>
          db()
            .prepare(
              "UPDATE users SET newsletter_token=COALESCE(newsletter_token,?) WHERE id=? AND status='active' AND newsletter=1 RETURNING newsletter_token,email",
            )
            .bind(newsletterToken(), row.user_id),
        ),
      );
      const recipients = claimed.flatMap((row, i) => {
        const user = users[i].results[0];
        return user ? [{ user_id: row.user_id, ...user }] : [];
      });
      // Left, suspended or opted out between the claim and now: dropped like any other non-subscriber.
      const gone = claimed.filter((_, i) => !users[i].results[0]);
      if (gone.length)
        await db().batch(
          gone.map((row) =>
            db().prepare('DELETE FROM newsletter_deliveries WHERE newsletter_id=? AND user_id=?').bind(id, row.user_id),
          ),
        );
      const origin = new URL(request.url).origin;
      const release = (rows: { user_id: string }[]) =>
        rows.map((row) =>
          db()
            .prepare("UPDATE newsletter_deliveries SET status='pending',sent_at=NULL WHERE newsletter_id=? AND user_id=? AND status='sending'")
            .bind(id, row.user_id),
        );
      if (recipients.length) {
        let result;
        try {
          result = await sendMail(
            recipients.map((row) => ({
              to: row.email,
              subject: letter.subject,
              html: withFooter(letter.html, unsubscribeUrl(origin, row.newsletter_token)),
            })),
          );
        } catch (e) {
          // Refused before mailing: back to pending for the next click. Unknown outcome: failed, never resent.
          await db().batch(
            e instanceof Unconfirmed
              ? recipients.map((row) =>
                  db()
                    .prepare(
                      "UPDATE newsletter_deliveries SET status='failed',sent_at=NULL,error=? WHERE newsletter_id=? AND user_id=? AND status='sending'",
                    )
                    .bind(UNCONFIRMED_ERROR, id, row.user_id),
                )
              : release(recipients),
          );
          throw e;
        }
        remaining = result.remaining;
        const done = Date.now();
        await db().batch(
          recipients.map((row, i) => {
            const outcome = result.results[i];
            // 'quota' means the day's limit ran out mid-batch: back to pending for tomorrow, not a failure.
            if (outcome.ok) sent++;
            else if (outcome.error !== 'quota') failed++;
            return outcome.ok
              ? db()
                  .prepare("UPDATE newsletter_deliveries SET status='sent',sent_at=?,error=NULL WHERE newsletter_id=? AND user_id=?")
                  .bind(done, id, row.user_id)
              : outcome.error === 'quota'
                ? release([row])[0]
                : db()
                    .prepare("UPDATE newsletter_deliveries SET status='failed',sent_at=NULL,error=? WHERE newsletter_id=? AND user_id=?")
                    .bind((outcome.error || '발송 실패').slice(0, 200), id, row.user_id);
          }),
        );
      }
    }
    const left = await pending();
    if (!left)
      await db()
        .prepare(
          "UPDATE newsletters SET sent_at=?1 WHERE id=?2 AND sent_at IS NULL AND NOT EXISTS (SELECT 1 FROM newsletter_deliveries WHERE newsletter_id=?2 AND status IN ('pending','sending'))",
        )
        .bind(Date.now(), id)
        .run();
    // exhausted: today's quota is used up with recipients still waiting ('오늘 발송 한도를 다 썼습니다…').
    return json({ sent, failed, pending: left, remaining, done: !left, exhausted: !!left && remaining <= 0 });
  });
}
