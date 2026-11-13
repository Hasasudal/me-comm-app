import { db, handle, HttpError, input, json, limit, requireAdmin, requireMember } from '../../../lib/server';
import { bucket, cardNewsColumns, cardNewsKey, cardNewsSchema, MAX_CARD_NEWS_BYTES } from '../../../lib/card-news';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return handle(async () => {
    const member = await requireMember(request);
    const rows = await db()
      .prepare(`SELECT ${cardNewsColumns(member)} FROM card_news ORDER BY created_at DESC LIMIT 200`)
      .all();
    return json({ items: rows.results });
  });
}

// Admins upload one self-contained HTML file (images embedded or linked by https URL).
export async function POST(request: Request) {
  return handle(async () => {
    const member = await requireAdmin(request);
    await limit(request, 'card-news', 10, member.userId);
    // JSON-escaped HTML grows a little, hence the headroom over the file cap.
    const { title, html } = cardNewsSchema.parse(await input(request, MAX_CARD_NEWS_BYTES * 1.2));
    const bytes = new TextEncoder().encode(html);
    if (bytes.byteLength > MAX_CARD_NEWS_BYTES) throw new HttpError(413, 'HTML 파일은 10MB 이하만 올릴 수 있어요.');
    const id = crypto.randomUUID();
    await bucket().put(cardNewsKey(id), bytes, { httpMetadata: { contentType: 'text/html; charset=utf-8' } });
    await db()
      .prepare('INSERT INTO card_news (id,title,size,author_id,author_name,created_at) VALUES (?,?,?,?,?,?)')
      .bind(id, title, bytes.byteLength, member.userId, member.displayName, Date.now())
      .run();
    return json({ id }, 201);
  });
}
