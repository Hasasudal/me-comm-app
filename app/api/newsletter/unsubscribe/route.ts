import { z } from 'zod';
import { db, handle, input, json, limit } from '../../../../lib/server';

export const dynamic = 'force-dynamic';

// The footer link's page posts the token here; no sign-in. Unknown tokens get the same answer, so none can be probed.
export async function POST(request: Request) {
  return handle(async () => {
    await limit(request, 'newsletter-unsubscribe', 10);
    const { token } = z.object({ token: z.string().min(1).max(100) }).parse(await input(request));
    await db()
      .prepare('UPDATE users SET newsletter=0,updated_at=? WHERE newsletter_token=? AND newsletter=1')
      .bind(Date.now(), token)
      .run();
    return json({ ok: true });
  });
}
