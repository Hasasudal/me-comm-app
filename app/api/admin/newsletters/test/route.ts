import { z } from 'zod';
import { newsletterFields, requireConfigured, sendMail, withFooter } from '../../../../../lib/newsletter';
import { db, handle, HttpError, input, json, limit, requireAdmin } from '../../../../../lib/server';

export const dynamic = 'force-dynamic';

// Preview to the requesting admin's own address plus up to 5 more, but only addresses of registered active members
// (never arbitrary ones); the footer link points at the account page instead of a token.
const MAX_EXTRA = 5;
export async function POST(request: Request) {
  return handle(async () => {
    const admin = await requireAdmin(request);
    await limit(request, 'newsletter-test', 5, admin.userId);
    const { subject, html, to } = z
      .object({ ...newsletterFields, to: z.string().max(1000).default('') })
      .parse(await input(request, 1000000));
    const wanted = [
      ...new Set(
        to
          .split(/[,;\s]+/)
          .map((v) => v.trim().toLowerCase())
          .filter(Boolean),
      ),
    ].filter((v) => v !== admin.email.toLowerCase());
    if (wanted.length > MAX_EXTRA) throw new HttpError(400, `추가 수신자는 ${MAX_EXTRA}명까지 입력할 수 있어요.`);
    const found = wanted.length
      ? (
          await db()
            .prepare(
              `SELECT email FROM users WHERE status='active' AND lower(email) IN (${wanted.map(() => '?').join(',')})`,
            )
            .bind(...wanted)
            .all<{ email: string }>()
        ).results.map((row) => row.email)
      : [];
    const unknown = wanted.filter((v) => !found.some((email) => email.toLowerCase() === v));
    if (unknown.length) throw new HttpError(400, `가입한 회원 이메일이 아니에요: ${unknown.join(', ')}`);
    requireConfigured();
    const origin = new URL(request.url).origin;
    const { results, remaining } = await sendMail(
      [admin.email, ...found].map((email) => ({
        to: email,
        subject: `[테스트] ${subject}`,
        html: withFooter(html, `${origin}/account`),
      })),
    );
    const bad = results.find((r) => !r.ok);
    if (bad)
      throw new HttpError(
        bad.error === 'quota' ? 429 : 502,
        bad.error === 'quota'
          ? '오늘 발송 한도를 다 썼습니다. 내일 이어서 보내세요.'
          : '테스트 메일을 보내지 못했습니다.',
      );
    return json({ ok: true, remaining, count: results.length });
  });
}
