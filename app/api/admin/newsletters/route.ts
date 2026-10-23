import { z } from 'zod';
import { configured, newsletterFields, quotaOrNull } from '../../../../lib/newsletter';
import { db, handle, input, json, limit, requireAdmin } from '../../../../lib/server';

export const dynamic = 'force-dynamic';

// The 20 latest newsletters with their schedule, who started sending, delivery counts ('sending' is counted as pending), today's
// quota and subscribers.
export async function GET(request: Request) {
  return handle(async () => {
    await requireAdmin(request);
    const count = (status: string) =>
      `(SELECT COUNT(*) FROM newsletter_deliveries d WHERE d.newsletter_id=n.id AND d.status IN (${status}))`;
    const [rows, subscribers, remaining] = await Promise.all([
      db()
        .prepare(
          `SELECT id,subject,created_at,created_by_name,started_at,started_by_name,sent_at,scheduled_at,scheduled_by_name,(SELECT COUNT(*) FROM newsletter_deliveries d WHERE d.newsletter_id=n.id) AS total,${count("'sent'")} AS sent,${count("'failed'")} AS failed,${count("'pending','sending'")} AS pending FROM newsletters n ORDER BY created_at DESC, id DESC LIMIT 20`,
        )
        .all(),
      db()
        .prepare("SELECT COUNT(*) AS count FROM users WHERE status='active' AND newsletter=1")
        .first<{ count: number }>(),
      quotaOrNull(),
    ]);
    return json({
      configured: configured(),
      remaining,
      subscribers: subscribers?.count ?? 0,
      newsletters: rows.results,
    });
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const admin = await requireAdmin(request);
    await limit(request, 'newsletter-create', 20, admin.userId);
    const { subject, html } = z.object(newsletterFields).parse(await input(request, 1000000));
    const id = crypto.randomUUID();
    await db()
      .prepare(
        'INSERT INTO newsletters (id,subject,html,created_by,created_by_name,created_at) VALUES (?,?,?,?,?,?)',
      )
      .bind(id, subject, html, admin.userId, admin.displayName, Date.now())
      .run();
    return json({ id });
  });
}
