import {
  createSchema,
  db,
  escapeLike,
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
const PAGE_SIZE = 30;
export async function GET(request: Request) {
  return handle(async () => {
    const member = await requireMember(request);
    const url = new URL(request.url);
    const category = url.searchParams.get('category');
    if (category && !['board', 'news', 'clubs', 'contests'].includes(category))
      throw new HttpError(400, '지원하지 않는 게시판입니다.');
    const where: string[] = [];
    const binds: (string | number)[] = [];
    // News tab lists only the member's own submissions; the combined board never includes news.
    if (category === 'news') {
      where.push("category='news' AND author_id=?");
      binds.push(member.userId);
    } else if (category) {
      where.push("status='published' AND category=?");
      binds.push(category);
    } else where.push("status='published' AND category<>'news'");
    const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
    if (q) {
      where.push("(title LIKE ? ESCAPE '\\' OR prefix LIKE ? ESCAPE '\\')");
      binds.push(`%${escapeLike(q)}%`, `%${escapeLike(q)}%`);
    }
    // Keyset cursor "createdAt:id" keeps pages stable while new posts arrive.
    const cursor = /^(\d+):([\w-]+)$/.exec(url.searchParams.get('cursor') || '');
    if (cursor) {
      where.push('(created_at<? OR (created_at=? AND id<?))');
      binds.push(Number(cursor[1]), Number(cursor[1]), cursor[2]);
    }
    const result = await db()
      .prepare(
        `SELECT ${listColumns} FROM posts WHERE ${where.join(' AND ')} ORDER BY created_at DESC, id DESC LIMIT ?`,
      )
      .bind(...binds, PAGE_SIZE + 1)
      .all<{ id: string; created_at: number }>();
    const posts = result.results.slice(0, PAGE_SIZE);
    const last = posts[posts.length - 1];
    return json({ posts, nextCursor: result.results.length > PAGE_SIZE ? `${last.created_at}:${last.id}` : null });
  });
}
export async function POST(request: Request) {
  return handle(async () => {
    const member = await requireMember(request);
    const data = createSchema.parse(await input(request));
    await limit(request, 'create', 10, member.userId);
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
