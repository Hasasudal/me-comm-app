import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { FirebaseTokenError } from './firebase-token';
import { db } from './database';
import { HttpError } from './http-error';
import { optionalMember, requireMember, type Member } from './member-auth';
import { verifyPassword } from './password';
import type { Review } from './annotations';

export { db, HttpError, requireMember };
export function json(value: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff', ...headers },
  });
}
export async function handle(action: () => Promise<Response>) {
  try {
    return await action();
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    if (e instanceof FirebaseTokenError) return json({ error: e.message }, 401);
    if (e instanceof z.ZodError) return json({ error: e.issues[0]?.message || '입력 내용을 확인해주세요.' }, 400);
    console.error('Community API failed', e instanceof Error ? e.message : 'Unknown error');
    return json({ error: '요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.' }, 503);
  }
}
export async function input(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) throw new HttpError(403, '허용되지 않은 요청입니다.');
  if (!request.headers.get('content-type')?.includes('application/json'))
    throw new HttpError(415, 'JSON 요청이 필요합니다.');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, '입력 내용이 없습니다.');
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 100000) {
      await reader.cancel();
      throw new HttpError(413, '입력 내용이 너무 큽니다.');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new HttpError(400, '입력 형식이 올바르지 않습니다.');
  }
}
export const contentFields = {
  title: z.string().trim().min(1, '제목을 입력해주세요.').max(120, '제목은 120자 이내로 입력해주세요.'),
  content: z.string().trim().min(1, '본문을 입력해주세요.').max(20000, '본문은 20,000자 이내로 입력해주세요.'),
};
export const passwordField = z
  .string()
  .min(8, '비밀번호는 8자 이상 입력해주세요.')
  .max(128, '비밀번호는 128자 이내로 입력해주세요.');
export const recruitmentFields = {
  recruitment_status: z.enum(['open', 'closed']).optional().nullable(),
  deadline: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, '마감일을 확인해주세요.')
    .optional()
    .nullable(),
  headcount: z
    .number()
    .int()
    .min(1, '모집 인원은 1명 이상이어야 합니다.')
    .max(99, '모집 인원은 99명 이내로 입력해주세요.')
    .optional()
    .nullable(),
  roles: z
    .string()
    .trim()
    .min(1, '필요한 역할을 입력해주세요.')
    .max(200, '필요한 역할은 200자 이내로 입력해주세요.')
    .optional()
    .nullable(),
};
export const authorFields = {
  author_name: z
    .string()
    .trim()
    .min(1, '작성자 이름을 입력해주세요.')
    .max(20, '작성자 이름은 20자 이내로 입력해주세요.'),
  prefix: z
    .string()
    .trim()
    .max(30, '머릿글은 30자 이내로 입력해주세요.')
    .optional()
    .nullable()
    .transform((value) => value || null),
};
export const createSchema = z.object({
  ...contentFields,
  ...recruitmentFields,
  ...authorFields,
  category: z.enum(['board', 'news', 'clubs', 'contests']),
  password: passwordField,
});
export const editSchema = z.object({
  ...contentFields,
  ...recruitmentFields,
  ...authorFields,
  password: passwordField.optional(),
});
export const markSchema = z
  .object({
    start: z.number().int().min(0),
    end: z.number().int().min(1),
    type: z.enum(['highlight', 'bold', 'memo']),
    memo: z.string().trim().max(500, '메모는 500자 이내로 입력해주세요.').optional(),
  })
  .refine((mark) => mark.start < mark.end, '표시 범위를 확인해주세요.')
  .refine((mark) => mark.type !== 'memo' || !!mark.memo, '메모 내용을 입력해주세요.');
export function recruitmentValues(
  data: {
    recruitment_status?: 'open' | 'closed' | null;
    deadline?: string | null;
    headcount?: number | null;
    roles?: string | null;
  },
  category: string,
) {
  if (category !== 'clubs' && category !== 'contests') return [null, null, null, null] as const;
  if (!data.recruitment_status || !data.deadline || !data.headcount || !data.roles)
    throw new HttpError(400, '모집 상태, 마감일, 인원과 필요한 역할을 모두 입력해주세요.');
  return [data.recruitment_status, data.deadline, data.headcount, data.roles] as const;
}
export async function identity(request?: Request) {
  const configured = !!env.ADMIN_JOIN_CODE_HASH && !!env.ADMIN_JOIN_CODE_SALT;
  if (request) {
    const member = await optionalMember(request);
    if (member) {
      // Latest review result on the member's own news, so the sidebar can flag unseen feedback.
      const reviewed = await db()
        .prepare("SELECT MAX(updated_at) AS at FROM posts WHERE category='news' AND author_id=? AND status<>'pending'")
        .bind(member.userId)
        .first<{ at: number | null }>();
      return {
        newsReviewedAt: reviewed?.at ?? null,
        admin: await isAdmin(member.userId),
        signedIn: true,
        configured,
        userId: member.userId,
        email: member.email,
        displayName: member.displayName,
      };
    }
  }
  return { admin: false, signedIn: false, configured };
}
export function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}
export async function isAdmin(userId: string) {
  return !!(await db()
    .prepare('SELECT user_id FROM admin_users WHERE user_id=? AND revoked_at IS NULL')
    .bind(userId)
    .first());
}
export async function requireAdmin(request: Request) {
  const user = await requireMember(request);
  if (!(await isAdmin(user.userId))) throw new HttpError(403, '관리자 권한이 필요합니다.');
  return user;
}
// Counts per signed-in member when `subject` is given; IP is only a fallback because campus Wi-Fi shares one address.
export async function limit(request: Request, scope: string, max = 30, subject?: string) {
  const who = subject ? `member:${subject}` : `ip:${request.headers.get('cf-connecting-ip') || 'local'}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${scope}:${who}`));
  const key = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  const now = Date.now();
  await db().prepare('DELETE FROM attempts WHERE expires_at < ?').bind(now).run();
  const result = await db()
    .prepare(
      'INSERT INTO attempts (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count',
    )
    .bind(key, now + 60000)
    .first<{ count: number }>();
  if (result && result.count > max) throw new HttpError(429, '요청이 너무 많습니다. 1분 후 다시 시도해주세요.');
}
export type PostRow = {
  id: string;
  category: string;
  title: string;
  content: string;
  password_hash: string;
  salt: string;
  status: string;
  recruitment_status: 'open' | 'closed' | null;
  deadline: string | null;
  headcount: number | null;
  roles: string | null;
  author_id: string | null;
  author_name: string | null;
  prefix: string | null;
  feedback: string | null;
  created_at: number;
  updated_at: number;
};
export const listColumns =
  'id,title,category,prefix,author_name,status,recruitment_status,deadline,headcount,roles,created_at,updated_at';
// News is private to its author and administrators; every other board is readable by any member.
export async function visiblePost(id: string, member: Member, admin: boolean) {
  const post = await db().prepare('SELECT * FROM posts WHERE id=?').bind(id).first<PostRow>();
  if (!post || (post.category === 'news' && !admin && post.author_id !== member.userId))
    throw new HttpError(404, '게시글을 찾을 수 없습니다.');
  return post;
}
export async function checkPostPassword(
  request: Request,
  post: PostRow,
  password: string | undefined,
  member: Member,
  admin: boolean,
) {
  if (admin) return;
  if (!password) throw new HttpError(400, '게시글 비밀번호를 입력해주세요.');
  await limit(request, 'password', 30, member.userId);
  if (!(await verifyPassword(password, post.salt, post.password_hash)))
    throw new HttpError(403, '비밀번호가 일치하지 않습니다.');
}
export function parseReview(value: string | null): Review | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as Review;
  } catch {
    return null;
  }
}
export function publicPost(post: PostRow) {
  return {
    id: post.id,
    category: post.category,
    title: post.title,
    content: post.content,
    prefix: post.prefix,
    author_name: post.author_name,
    status: post.status,
    feedback: parseReview(post.feedback),
    recruitment_status: post.recruitment_status,
    deadline: post.deadline,
    headcount: post.headcount,
    roles: post.roles,
    created_at: post.created_at,
    updated_at: post.updated_at,
  };
}
