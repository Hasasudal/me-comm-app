import {
  createSchema,
  db,
  deskCategories,
  escapeLike,
  handle,
  HttpError,
  input,
  isAdmin,
  json,
  limit,
  listColumns,
  recruitmentValues,
  requireMember,
} from '../../../lib/server';
import { hashPassword } from '../../../lib/password';
import { searchSnippet } from '../../../lib/search';
import { attachImages } from '../../../lib/images';
import { seoulToday } from '../../../lib/recruitment';
export const dynamic = 'force-dynamic';
const PAGE_SIZE = 30;
type ListRow = { id: string; created_at: number; content?: string };
export async function GET(request: Request) {
  return handle(async () => {
    const member = await requireMember(request);
    const url = new URL(request.url);
    const category = url.searchParams.get('category');
    if (category && !['board', 'inquiry', 'complaint', 'news', 'clubs', 'contests'].includes(category))
      throw new HttpError(400, '지원하지 않는 게시판입니다.');
    const where: string[] = [];
    const binds: (string | number)[] = [];
    // News lists only the member's own submissions; desks list the member's own, or all of them for admins.
    // The combined board never includes private boards.
    if (category && (category === 'news' || (deskCategories.includes(category) && !(await isAdmin(member.userId))))) {
      where.push('category=? AND author_id=?');
      binds.push(category, member.userId);
    } else if (category) {
      where.push("status='published' AND category=?");
      binds.push(category);
    } else where.push("status='published' AND category NOT IN ('news','inquiry','complaint')");
    // "Open only" mirrors recruitmentState: open and not past its deadline.
    if ((category === 'clubs' || category === 'contests') && url.searchParams.get('open') === '1') {
      where.push("recruitment_status='open' AND (deadline IS NULL OR deadline>=?)");
      binds.push(seoulToday());
    }
    const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
    if (q) {
      where.push(
        "(title LIKE ? ESCAPE '\\' OR prefix LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\' OR author_name LIKE ? ESCAPE '\\')",
      );
      binds.push(...Array(4).fill(`%${escapeLike(q)}%`));
    }
    // Keyset cursor "createdAt:id" keeps pages stable while new posts arrive.
    const cursor = /^(\d+):([\w-]+)$/.exec(url.searchParams.get('cursor') || '');
    if (cursor) {
      where.push('(created_at<? OR (created_at=? AND id<?))');
      binds.push(Number(cursor[1]), Number(cursor[1]), cursor[2]);
    }
    const columns = `${listColumns}${q ? ',content' : ''}`,
      filter = where.join(' AND ');
    // Pinned posts lead the first page; the paged feed skips them so nothing shows twice.
    const [pinned, result] = await Promise.all([
      cursor
        ? null
        : db()
            .prepare(`SELECT ${columns} FROM posts WHERE ${filter} AND pinned_at IS NOT NULL ORDER BY pinned_at DESC`)
            .bind(...binds)
            .all<ListRow>(),
      db()
        .prepare(
          `SELECT ${columns} FROM posts WHERE ${filter} AND pinned_at IS NULL ORDER BY created_at DESC, id DESC LIMIT ?`,
        )
        .bind(...binds, PAGE_SIZE + 1)
        .all<ListRow>(),
    ]);
    const page = result.results.slice(0, PAGE_SIZE);
    const last = page[page.length - 1];
    // Bodies never leave the list endpoint; a search only returns the matching excerpt.
    const posts = [...(pinned?.results || []), ...page].map(({ content, ...post }) =>
      q && content ? { ...post, snippet: searchSnippet(content, q) } : post,
    );
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
    await attachImages(id, data.images, member.userId);
    return json({ id, status }, 201);
  });
}
