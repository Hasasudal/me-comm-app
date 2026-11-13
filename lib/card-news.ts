import { z } from 'zod';
import { bucket } from './images';
import { isAdmin, visible } from './server';
import type { Member } from './member-auth';

export const MAX_CARD_NEWS_BYTES = 10 * 1024 * 1024;
export const cardNewsKey = (id: string) => `card-news/${id}.html`;
export const cardNewsId = z.string().regex(/^[0-9a-f-]{36}$/);
export const cardNewsSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, '제목을 입력해주세요.')
    .max(100, '제목은 100자까지 쓸 수 있어요.')
    .refine(...visible),
  html: z.string().min(1, 'HTML 파일이 비어 있어요.'),
});
export { bucket };
// The uploader's account name is for admins only (names elsewhere are nicknames); members see 운영진.
export const cardNewsColumns = (member: Member) =>
  isAdmin(member) ? 'id,title,size,author_name,created_at' : 'id,title,size,created_at';
export { cardNewsCsp } from './card-news-csp';
