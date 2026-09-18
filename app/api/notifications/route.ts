import { alertsSql, db, deskCategories, handle, json, managesDesk, requireMember } from '../../../lib/server';

export const dynamic = 'force-dynamic';

// The 20 latest bell items: comments others left on my posts, and for 학사·학생회·관리자 new posts and
// follow-up questions on the desks they answer.
export async function GET(request: Request) {
  return handle(async () => {
    const member = await requireMember(request);
    const desks = deskCategories.filter((category) => managesDesk(member, category));
    const rows = await db()
      .prepare(`SELECT * FROM (${alertsSql(desks)}) ORDER BY created_at DESC LIMIT 20`)
      .bind(member.userId)
      .all();
    return json({ replies: rows.results });
  });
}
