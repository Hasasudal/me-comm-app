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
      .enum(['all', 'active', 'suspended', 'pending', 'unverified'])
      .catch('all')
      .parse(url.searchParams.get('status') || 'all');
    const role = z
      .enum(['all', 'member', 'academic', 'council', 'admin'])
      .catch('all')
      .parse(url.searchParams.get('role') || 'all');
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
    // 'unverified' = active members whose address no verified sign-in ever vouched for.
    const unverified = status === 'unverified',
      state = unverified ? 'active' : status;
    const where = `(?='all' OR status=?) AND (?=0 OR email_verified_at IS NULL) AND (?='all' OR role=?) AND (?='' OR lower(email) LIKE lower(?) ESCAPE '\\' OR lower(display_name) LIKE lower(?) ESCAPE '\\')`;
    const [rows, total] = await Promise.all([
      db()
        .prepare(
          `SELECT id,email,display_name,status,role,suspended_at,created_at,updated_at,email_verified_at IS NOT NULL AS email_verified FROM users WHERE ${where} ORDER BY (status='pending') DESC, (role<>'member') DESC, created_at DESC LIMIT ? OFFSET ?`,
        )
        .bind(state, state, +unverified, role, role, query, pattern, pattern, limit, offset)
        .all(),
      db()
        .prepare(`SELECT COUNT(*) AS count FROM users WHERE ${where}`)
        .bind(state, state, +unverified, role, role, query, pattern, pattern)
        .first<{ count: number }>(),
    ]);
    return json({ users: rows.results.map((row) => ({ ...row, email_verified: !!row.email_verified })), page, limit, total: total?.count || 0 });
  });
}
