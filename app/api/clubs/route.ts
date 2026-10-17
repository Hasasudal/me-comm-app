import { z } from 'zod';
import { db, handle, HttpError, input, json, limit, requireMember, visible } from '../../../lib/server';
import { clubNameField } from '../../../lib/clubs';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return handle(async () => {
    await requireMember(request);
    const rows = await db().prepare("SELECT id,name FROM clubs WHERE status='active' ORDER BY name").all();
    return json({ clubs: rows.results });
  });
}
// Any member may ask for a club; it stays hidden until an admin approves it.
export async function POST(request: Request) {
  return handle(async () => {
    const member = await requireMember(request);
    const { name } = z.object({ name: clubNameField.refine(...visible) }).parse(await input(request));
    await limit(request, 'club', 5, member.userId);
    // ponytail: count-then-insert, so two simultaneous requests may slip one past the cap; the rate limit bounds it.
    const pending = await db()
      .prepare("SELECT COUNT(*) AS count FROM clubs WHERE requested_by=? AND status='pending'")
      .bind(member.userId)
      .first<{ count: number }>();
    if ((pending?.count ?? 0) >= 3) throw new HttpError(409, '승인을 기다리는 신청은 3개까지 할 수 있습니다.');
    const id = crypto.randomUUID();
    const result = await db()
      .prepare(
        "INSERT INTO clubs (id,name,status,requested_by,created_at) VALUES (?,?,'pending',?,?) ON CONFLICT(name) DO NOTHING",
      )
      .bind(id, name, member.userId, Date.now())
      .run();
    if (!result.meta.changes) throw new HttpError(409, '이미 있거나 신청된 동아리 이름입니다.');
    return json({ id }, 201);
  });
}
