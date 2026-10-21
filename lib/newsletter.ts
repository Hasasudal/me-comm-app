import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { HttpError } from './http-error';
import { visible } from './server';

// Mail goes out through a Google Apps Script web app running under the admin's Gmail (MailApp, ~100/day).
export const BATCH = 20; // the script rejects more than 20 messages per call
const UNREACHABLE = '메일 발송 서버에 연결하지 못했습니다.';

export function configured() {
  return !!(env.NEWSLETTER_SCRIPT_URL?.trim() && env.NEWSLETTER_SCRIPT_SECRET?.trim());
}
export function requireConfigured() {
  if (!configured()) throw new HttpError(503, '뉴스레터 발송이 아직 설정되지 않았습니다.');
}

const reply = z.object({
  ok: z.literal(true),
  remaining: z.number(),
  results: z.array(z.object({ to: z.string(), ok: z.boolean(), error: z.string().optional() })).optional(),
});
// POST as text/plain so Apps Script takes it without a CORS preflight; fetch follows its 302 to googleusercontent.
async function call(body: object) {
  requireConfigured();
  try {
    const response = await fetch(env.NEWSLETTER_SCRIPT_URL!.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ secret: env.NEWSLETTER_SCRIPT_SECRET!.trim(), ...body }),
      signal: AbortSignal.timeout(25000),
    });
    return reply.parse(await response.json());
  } catch (e) {
    console.error('Newsletter script failed', e instanceof Error ? e.message : 'Unknown error');
    throw new HttpError(502, UNREACHABLE);
  }
}
export async function quota() {
  return (await call({ action: 'quota' })).remaining;
}
/** Remaining daily quota, or null when unconfigured or unreachable (for display only). */
export async function quotaOrNull() {
  if (!configured()) return null;
  return quota().catch(() => null);
}
export type Message = { to: string; subject: string; html: string };
/** Results are in the same order as `messages`. */
export async function sendMail(messages: Message[]) {
  const result = await call({ action: 'send', messages });
  if (result.results?.length !== messages.length) throw new HttpError(502, UNREACHABLE);
  return { results: result.results, remaining: result.remaining };
}

export const newsletterFields = {
  subject: z
    .string()
    .trim()
    .min(1, '제목을 입력해주세요.')
    .max(150, '제목은 150자 이내로 입력해주세요.')
    .refine(...visible),
  // The script refuses messages over 200,000 chars; 150,000 leaves room for the footer.
  html: z
    .string()
    .min(1, '본문을 입력해주세요.')
    .max(150000, '뉴스레터 HTML이 너무 큽니다.')
    .transform(sanitize)
    .pipe(z.string().trim().min(1, '본문을 입력해주세요.')),
};
// Basic hygiene only: admins write these, and mail clients ignore scripts anyway. Drops <script> blocks (and stray
// opening tags) and on*= handler attributes inside tags. javascript: URLs, <iframe> etc. are left to mail clients.
export function sanitize(html: string) {
  return html
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<\/?script\b[^>]*>/gi, '')
    .replace(/<[^>]+>/g, (tag) => tag.replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, ''));
}

const escape = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export const unsubscribeUrl = (origin: string, token: string) =>
  `${origin}/newsletter/unsubscribe?token=${encodeURIComponent(token)}`;
/** Puts the opt-out footer before </body>, or at the end when there is none. */
export function withFooter(html: string, link: string) {
  const footer =
    '<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.6;color:#6b7280;font-family:sans-serif">' +
    '미컴 라운지 회원에게 보내는 학과 뉴스레터입니다. 더 받고 싶지 않다면 아래 링크로 수신을 끌 수 있습니다.<br>' +
    `<a href="${escape(link)}" style="color:#6b7280;text-decoration:underline">뉴스레터 받지 않기</a></div>`;
  const end = html.search(/<\/body\s*>/i);
  return end < 0 ? html + footer : html.slice(0, end) + footer + html.slice(end);
}

export function newsletterToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
