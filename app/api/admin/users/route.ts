import { z } from 'zod';
import { db, escapeLike, handle, json, requireAdmin } from '../../../../lib/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return handle(async () => {
    await requireAdmin(request);
    const url = new URL(request.url);
    const query = z
      .string()
      .max(100, '검색어는 100자 이내로 입력해주세요.')
      .parse(url.searchParams.get('q') || '')
      .trim();
    const status = z
      .enum(['all', 'active', 'suspended'])
      .catch('all')
      .parse(url.searchParams.get('status') || 'all');
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .catch(1)
      .parse(url.searchParams.get('page') || '1');
    const limit = z.coerce
      .number()
      .int()
      .min(1)
      .max(50)
      .catch(20)
      .parse(url.searchParams.get('limit') || '20');
    const pattern = `%${escapeLike(query)}%`,
      offset = (page - 1) * limit;
    const where = `(?='all' OR status=?) AND (?='' OR lower(email) LIKE lower(?) ESCAPE '\\' OR lower(display_name) LIKE lower(?) ESCAPE '\\')`;
    const [rows, total] = await Promise.all([
      db()
        .prepare(
          `SELECT id,email,display_name,status,suspended_at,created_at,updated_at FROM users WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        )
        .bind(status, status, query, pattern, pattern, limit, offset)
        .all(),
      db()
        .prepare(`SELECT COUNT(*) AS count FROM users WHERE ${where}`)
        .bind(status, status, query, pattern, pattern)
        .first<{ count: number }>(),
    ]);
    return json({ users: rows.results, page, limit, total: total?.count || 0 });
  });
}
