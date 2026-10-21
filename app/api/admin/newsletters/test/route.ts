import { z } from 'zod';
import { newsletterFields, requireConfigured, sendMail, withFooter } from '../../../../../lib/newsletter';
import { handle, HttpError, input, json, limit, requireAdmin } from '../../../../../lib/server';

export const dynamic = 'force-dynamic';

// One preview to the requesting admin's own address; the footer link points at the account page instead of a token.
export async function POST(request: Request) {
  return handle(async () => {
    const admin = await requireAdmin(request);
    const { subject, html } = z.object(newsletterFields).parse(await input(request, 1000000));
    requireConfigured();
    await limit(request, 'newsletter-test', 5, admin.userId);
    const origin = new URL(request.url).origin;
    const { results, remaining } = await sendMail([
      { to: admin.email, subject: `[테스트] ${subject}`, html: withFooter(html, `${origin}/account`) },
    ]);
    if (!results[0].ok)
      throw new HttpError(
        results[0].error === 'quota' ? 429 : 502,
        results[0].error === 'quota'
          ? '오늘 발송 한도를 다 썼습니다. 내일 이어서 보내세요.'
          : '테스트 메일을 보내지 못했습니다.',
      );
    return json({ ok: true, remaining });
  });
}
