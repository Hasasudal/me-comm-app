import { z } from 'zod';
import { db, HttpError } from './server';

export const clubNameField = z
  .string()
  .trim()
  .min(1, '동아리 이름을 입력해주세요.')
  .max(30, '동아리 이름은 30자 이내로 입력해주세요.');
// Club posts must name an approved club; posts on other boards never carry one.
export async function clubFor(category: string, clubId: string | null | undefined) {
  if (category !== 'clubs') return null;
  if (!clubId) throw new HttpError(400, '동아리를 선택해주세요.');
  const club = await db().prepare("SELECT id FROM clubs WHERE id=? AND status='active'").bind(clubId).first();
  if (!club) throw new HttpError(400, '승인된 동아리만 선택할 수 있습니다.');
  return clubId;
}
