import { db, handle, HttpError, requireMember } from '../../../../../lib/server';
import { bucket, cardNewsCsp, cardNewsId, cardNewsKey } from '../../../../../lib/card-news';

export const dynamic = 'force-dynamic';

// The uploaded HTML itself, framed by /sisa/<id>. next.config.ts gives this path the same CSP and frame headers.
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await context.params;
    // Only as a frame: a top-level sandboxed page may still navigate its own tab (e.g. to a phishing page), so a
    // direct visit goes to the viewer instead. Browsers without Sec-Fetch-Dest get the page, still sandboxed.
    if (request.headers.get('sec-fetch-dest') === 'document')
      return Response.redirect(new URL(`/sisa/${encodeURIComponent(id)}`, request.url), 303);
    await requireMember(request);
    const known =
      cardNewsId.safeParse(id).success && (await db().prepare('SELECT 1 FROM card_news WHERE id=?').bind(id).first());
    const file = known ? await bucket().get(cardNewsKey(id)) : null;
    if (!file) throw new HttpError(404, '카드뉴스를 찾을 수 없어요. 삭제되었을 수 있어요.');
    return new Response(file.body, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': cardNewsCsp,
        'X-Frame-Options': 'SAMEORIGIN',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-cache',
        'Referrer-Policy': 'no-referrer',
      },
    });
  });
}
