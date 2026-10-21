import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { HttpError } from './http-error';
import { visible } from './server';

// Mail goes out through a Google Apps Script web app running under the admin's Gmail (MailApp, ~100/day).
// 10 per call (the script takes up to 20) keeps each call well inside TIMEOUT.
export const BATCH = 10;
const TIMEOUT = 90000; // Workers have no wall-clock limit while the admin's request stays open
const UNREACHABLE = '메일 발송 서버에 연결하지 못했습니다.';
export const UNCONFIRMED_ERROR = '발송 여부 확인 불가';

export function configured() {
  return !!(env.NEWSLETTER_SCRIPT_URL?.trim() && env.NEWSLETTER_SCRIPT_SECRET?.trim());
}
export function requireConfigured() {
  if (!configured()) throw new HttpError(503, '뉴스레터 발송이 아직 설정되지 않았습니다.');
}
/** A send whose outcome is unknown (timeout, network error, unreadable reply): the mail may have gone out. */
export class Unconfirmed extends HttpError {
  constructor() {
    super(502, '메일 발송 결과를 확인하지 못했습니다. Gmail 보낸편지함을 확인해주세요.');
  }
}

const reply = z.object({
  ok: z.literal(true),
  remaining: z.number(),
  results: z.array(z.object({ to: z.string(), ok: z.boolean(), error: z.string().optional() })).optional(),
});
const rejected = z.object({ ok: z.literal(false), error: z.string() });
// POST as text/plain so Apps Script takes it without a CORS preflight; fetch follows its 302 to googleusercontent.
// Only a parsed { ok:false } means the script refused before mailing anyone; anything else is Unconfirmed for sends.
async function call(body: { action: string; [key: string]: unknown }) {
  requireConfigured();
  const unknown = () => (body.action === 'send' ? new Unconfirmed() : new HttpError(502, UNREACHABLE));
  let data: unknown;
  try {
    const response = await fetch(env.NEWSLETTER_SCRIPT_URL!.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ secret: env.NEWSLETTER_SCRIPT_SECRET!.trim(), ...body }),
      signal: AbortSignal.timeout(TIMEOUT),
    });
    data = await response.json();
  } catch (e) {
    console.error('Newsletter script failed', e instanceof Error ? e.message : 'Unknown error');
    throw unknown();
  }
  const parsed = reply.safeParse(data);
  if (parsed.success) return parsed.data;
  const refusal = rejected.safeParse(data);
  console.error('Newsletter script refused', refusal.success ? refusal.data.error.slice(0, 50) : 'invalid reply');
  throw refusal.success ? new HttpError(502, UNREACHABLE) : unknown();
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
  if (result.results?.length !== messages.length) throw new Unconfirmed();
  return { results: result.results, remaining: result.remaining };
}

export const newsletterFields = {
  subject: z
    .string()
    .trim()
    .min(1, '제목을 입력해주세요.')
    .max(150, '제목은 150자 이내로 입력해주세요.')
    .refine(...visible),
  // MailApp's body limit is ~200KB in bytes (Korean is 3 bytes a char); 180KB leaves room for the footer.
  html: z
    .string()
    .min(1, '본문을 입력해주세요.')
    .transform(sanitize)
    .pipe(
      z
        .string()
        .trim()
        .min(1, '본문을 입력해주세요.')
        .refine((value) => new TextEncoder().encode(value).length <= 180000, '뉴스레터 HTML이 너무 큽니다. (최대 약 180KB)'),
    ),
};
// Basic hygiene only, not a security boundary: admins write these, and mail clients ignore scripts anyway. Drops
// <script> blocks (and stray opening tags), on*= handler attributes inside tags (after whitespace or '/'), and turns
// javascript: href/src values into '#'. Entity-encoded tricks, <iframe> etc. are left to mail clients.
export function sanitize(html: string) {
  return html
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<\/?script\b[^>]*>/gi, '')
    .replace(/<[^>]+>/g, (tag) =>
      tag
        .replace(/(?:\s|\/)+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(/((?:\s|\/)(?:href|src)\s*=\s*)(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*'|javascript:[^\s>]*)/gi, '$1"#"'),
    );
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
