import {
  createSchema,
  db,
  handle,
  HttpError,
  input,
  json,
  limit,
  listColumns,
  recruitmentValues,
  requireMember,
} from '../../../lib/server';
import { hashPassword } from '../../../lib/password';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return handle(async () => {
    const member = await requireMember(request);
    const category = new URL(request.url).searchParams.get('category');
    if (category && !['board', 'news', 'clubs', 'contests'].includes(category))
      throw new HttpError(400, '지원하지 않는 게시판입니다.');
    // News tab lists only the member's own submissions; the combined board never includes news.
    const query =
      category === 'news'
        ? db()
            .prepare(`SELECT ${listColumns} FROM posts WHERE category='news' AND author_id=? ORDER BY created_at DESC`)
            .bind(member.userId)
        : category
          ? db()
              .prepare(
                `SELECT ${listColumns} FROM posts WHERE status='published' AND category=? ORDER BY created_at DESC`,
              )
              .bind(category)
          : db().prepare(
              `SELECT ${listColumns} FROM posts WHERE status='published' AND category<>'news' ORDER BY created_at DESC`,
            );
    const result = await query.all();
    return json({ posts: result.results });
  });
}
export async function POST(request: Request) {
  return handle(async () => {
    const member = await requireMember(request);
    const data = createSchema.parse(await input(request));
    await limit(request, 'create', 10);
    const id = crypto.randomUUID(),
      salt = crypto.randomUUID(),
      now = Date.now();
    const [recruitmentStatus, deadline, headcount, roles] = recruitmentValues(data, data.category);
    const hash = await hashPassword(data.password, salt);
    const status = data.category === 'news' ? 'pending' : 'published';
    await db()
      .prepare(
        'INSERT INTO posts (id,category,title,content,password_hash,salt,status,recruitment_status,deadline,headcount,roles,author_id,author_name,prefix,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      )
      .bind(
        id,
        data.category,
        data.title,
        data.content,
        hash,
        salt,
        status,
        recruitmentStatus,
        deadline,
        headcount,
        roles,
        member.userId,
        data.author_name,
        data.prefix,
        now,
        now,
      )
      .run();
    return json({ id, status }, 201);
  });
}
