import { requireConfigured, sendNextBatch } from '../../../../../../lib/newsletter';
import { db, handle, input, json, limit, requireAdmin } from '../../../../../../lib/server';

export const dynamic = 'force-dynamic';

// Sends the next batch; the admin page calls this repeatedly until done (see sendNextBatch).
// Sending by hand turns a scheduled newsletter into a manual send: the cron leaves it alone from then on.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const admin = await requireAdmin(request);
    const { id } = await context.params;
    await input(request);
    requireConfigured();
    await limit(request, 'newsletter-send', 30, admin.userId);
    await db().prepare('UPDATE newsletters SET scheduled_at=NULL WHERE id=? AND scheduled_at IS NOT NULL').bind(id).run();
    return json(await sendNextBatch(id, { id: admin.userId, name: admin.displayName }, new URL(request.url).origin));
  });
}
