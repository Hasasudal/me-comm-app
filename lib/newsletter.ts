import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { db } from './database';
import { HttpError } from './http-error';
import { visible } from './server';

// Mail goes out through a Google Apps Script web app running under the admin's Gmail (MailApp, ~100/day).
// 10 per call (the script takes up to 20) keeps each call well inside TIMEOUT.
export const BATCH = 10;
const TIMEOUT = 90000; // Workers have no wall-clock limit while the admin's request stays open
const UNREACHABLE = '메일 발송 서버에 연결하지 못했어요. 잠시 후 다시 시도해주세요.';
export const UNCONFIRMED_ERROR = '발송 여부 확인 불가';

export function configured() {
  return !!(env.NEWSLETTER_SCRIPT_URL?.trim() && env.NEWSLETTER_SCRIPT_SECRET?.trim());
}
export function requireConfigured() {
  if (!configured()) throw new HttpError(503, '뉴스레터 발송 설정이 아직 안 됐어요. 도움말의 설정 안내를 따라주세요.');
}
/** A send whose outcome is unknown (timeout, network error, unreadable reply): the mail may have gone out. */
export class Unconfirmed extends HttpError {
  constructor() {
    super(502, '메일 발송 결과를 확인하지 못했어요. Gmail 보낸편지함을 확인해주세요.');
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
    // A 404 on the first hop (no redirect) is Google refusing the deployment itself (deleted/disabled): the script never ran.
    // After the 302 the script has already run, so a 404 there stays unknown.
    if (response.status === 404 && !response.redirected) throw new HttpError(502, UNREACHABLE);
    data = await response.json();
  } catch (e) {
    if (e instanceof HttpError) throw e;
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

export const audienceSchema = z.enum(['all', 'staff']);
export type Audience = z.infer<typeof audienceSchema>;
/** Subscribed active members per audience ('staff' = academic, council and admin roles). */
export async function audienceCounts() {
  const row = await db()
    .prepare(
      "SELECT COUNT(*) AS \"all\",COALESCE(SUM(role IN ('academic','council','admin')),0) AS staff FROM users WHERE status='active' AND newsletter=1",
    )
    .first<{ all: number; staff: number }>();
  return { all: row?.all ?? 0, staff: row?.staff ?? 0 };
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
// Links in mail use the configured public address, so scheduling from localhost or an old host can't bake in dead links.
export const siteOrigin = (request: Request) => env.SITE_URL?.trim().replace(/\/+$/, '') || new URL(request.url).origin;
export const unsubscribeUrl = (origin: string, token: string) =>
  `${origin}/newsletter/unsubscribe?token=${encodeURIComponent(token)}`;
/** Puts the opt-out footer before </body>, or at the end when there is none. */
export function withFooter(html: string, link: string) {
  const footer =
    '<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.6;color:#6b7280;font-family:sans-serif">' +
    '미컴 라운지 회원에게 보내는 학과 뉴스레터예요. 더 받고 싶지 않다면 아래 링크로 수신을 끌 수 있어요.<br>' +
    `<a href="${escape(link)}" style="color:#6b7280;text-decoration:underline">뉴스레터 받지 않기</a></div>`;
  const end = html.search(/<\/body\s*>/i);
  return end < 0 ? html + footer : html.slice(0, end) + footer + html.slice(end);
}

export function newsletterToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

const STALE = 5 * 60000;
export type Actor = { id: string; name: string };
// The cron passes `due` (now): every write that starts, continues or finishes the send then also requires
// scheduled_at<=due in the same statement, so a cancel or a switch to manual sending stops it atomically.
const scheduled = (n: number) => `(?${n} IS NULL OR EXISTS (SELECT 1 FROM newsletters WHERE id=?1 AND scheduled_at<=?${n}))`;

// Sends the next batch (≤BATCH, within today's quota); the admin page (or the cron) calls this repeatedly until done.
// Rows go pending -> sending (claimed by one atomic UPDATE, so two senders never mail the same person) -> sent/failed.
// A batch goes back to pending only when the script definitely refused it; if the outcome is unknown the rows become
// failed (UNCONFIRMED_ERROR) so nobody is mailed twice; admins check Gmail's 보낸편지함 for those.
export async function sendNextBatch(id: string, actor: Actor, origin: string, due: number | null = null) {
  requireConfigured();
  const letter = await db()
    .prepare('SELECT subject,html FROM newsletters WHERE id=?')
    .bind(id)
    .first<{ subject: string; html: string }>();
  if (!letter) throw new HttpError(404, '뉴스레터를 찾을 수 없어요.');
  const now = Date.now();
  await db().batch([
    // Who started sending, recorded once by the call that snapshots the recipients (runs before the snapshot).
    db()
      .prepare(
        `UPDATE newsletters SET started_by=?2,started_by_name=?3,started_at=?4 WHERE id=?1 AND started_at IS NULL AND sent_at IS NULL AND NOT EXISTS (SELECT 1 FROM newsletter_deliveries WHERE newsletter_id=?1) AND ${scheduled(5)}`,
      )
      .bind(id, actor.id, actor.name, now, due),
    // The first call snapshots the subscribers; later calls add nobody, so nobody can get it twice.
    db()
      .prepare(
        `INSERT OR IGNORE INTO newsletter_deliveries (newsletter_id,user_id,status) SELECT ?1,id,'pending' FROM users WHERE status='active' AND newsletter=1 AND NOT EXISTS (SELECT 1 FROM newsletter_deliveries WHERE newsletter_id=?1) AND EXISTS (SELECT 1 FROM newsletters WHERE id=?1 AND sent_at IS NULL AND (audience='all' OR users.role IN ('academic','council','admin'))) AND ${scheduled(2)}`,
      )
      .bind(id, due),
    // A worker that died mid-batch leaves 'sending' rows behind; the mail may have gone out, so they become failed.
    db()
      .prepare(
        "UPDATE newsletter_deliveries SET status='failed',sent_at=NULL,error=?3 WHERE newsletter_id=?1 AND status='sending' AND sent_at<?2",
      )
      .bind(id, now - STALE, UNCONFIRMED_ERROR),
    // Members who turned it off, were suspended or left since the snapshot are dropped (not counted as failed).
    db()
      .prepare(
        "DELETE FROM newsletter_deliveries WHERE newsletter_id=?1 AND status='pending' AND user_id NOT IN (SELECT id FROM users WHERE status='active' AND newsletter=1)",
      )
      .bind(id),
  ]);
  const pending = async () =>
    (
      await db()
        .prepare("SELECT COUNT(*) AS count FROM newsletter_deliveries WHERE newsletter_id=? AND status IN ('pending','sending')")
        .bind(id)
        .first<{ count: number }>()
    )?.count ?? 0;
  let remaining = await quota();
  let sent = 0;
  let failed = 0;
  const claimed =
    remaining > 0
      ? (
          await db()
            .prepare(
              `UPDATE newsletter_deliveries SET status='sending',sent_at=?3 WHERE newsletter_id=?1 AND status='pending' AND user_id IN (SELECT user_id FROM newsletter_deliveries WHERE newsletter_id=?1 AND status='pending' LIMIT ?4) AND ${scheduled(2)} RETURNING user_id`,
            )
            .bind(id, due, now, Math.min(BATCH, remaining))
            .all<{ user_id: string }>()
        ).results
      : [];
  if (claimed.length) {
    // The current address is read now (not at snapshot time), and only for members still active and subscribed.
    // Existing members subscribed by default have no token yet; it is made the first time they are mailed.
    const users = await db().batch<{ newsletter_token: string; email: string }>(
      claimed.map((row) =>
        db()
          .prepare(
            "UPDATE users SET newsletter_token=COALESCE(newsletter_token,?) WHERE id=? AND status='active' AND newsletter=1 RETURNING newsletter_token,email",
          )
          .bind(newsletterToken(), row.user_id),
      ),
    );
    const recipients = claimed.flatMap((row, i) => {
      const user = users[i].results[0];
      return user ? [{ user_id: row.user_id, ...user }] : [];
    });
    // Left, suspended or opted out between the claim and now: dropped like any other non-subscriber.
    const gone = claimed.filter((_, i) => !users[i].results[0]);
    if (gone.length)
      await db().batch(
        gone.map((row) =>
          db().prepare('DELETE FROM newsletter_deliveries WHERE newsletter_id=? AND user_id=?').bind(id, row.user_id),
        ),
      );
    const release = (rows: { user_id: string }[]) =>
      rows.map((row) =>
        db()
          .prepare("UPDATE newsletter_deliveries SET status='pending',sent_at=NULL WHERE newsletter_id=? AND user_id=? AND status='sending'")
          .bind(id, row.user_id),
      );
    if (recipients.length) {
      let result;
      try {
        result = await sendMail(
          recipients.map((row) => ({
            to: row.email,
            subject: letter.subject,
            html: withFooter(letter.html, unsubscribeUrl(origin, row.newsletter_token)),
          })),
        );
      } catch (e) {
        // Refused before mailing: back to pending for the next call. Unknown outcome: failed, never resent.
        await db().batch(
          e instanceof Unconfirmed
            ? recipients.map((row) =>
                db()
                  .prepare(
                    "UPDATE newsletter_deliveries SET status='failed',sent_at=NULL,error=? WHERE newsletter_id=? AND user_id=? AND status='sending'",
                  )
                  .bind(UNCONFIRMED_ERROR, id, row.user_id),
              )
            : release(recipients),
        );
        throw e;
      }
      remaining = result.remaining;
      const done = Date.now();
      await db().batch(
        recipients.map((row, i) => {
          const outcome = result.results[i];
          // 'quota' means the day's limit ran out mid-batch: back to pending for tomorrow, not a failure.
          if (outcome.ok) sent++;
          else if (outcome.error !== 'quota') failed++;
          return outcome.ok
            ? db()
                .prepare("UPDATE newsletter_deliveries SET status='sent',sent_at=?,error=NULL WHERE newsletter_id=? AND user_id=?")
                .bind(done, id, row.user_id)
            : outcome.error === 'quota'
              ? release([row])[0]
              : db()
                  .prepare("UPDATE newsletter_deliveries SET status='failed',sent_at=NULL,error=? WHERE newsletter_id=? AND user_id=?")
                  .bind((outcome.error || '발송 실패').slice(0, 200), id, row.user_id);
        }),
      );
    }
  }
  const left = await pending();
  if (!left)
    await db()
      .prepare(
        `UPDATE newsletters SET sent_at=?3 WHERE id=?1 AND sent_at IS NULL AND NOT EXISTS (SELECT 1 FROM newsletter_deliveries WHERE newsletter_id=?1 AND status IN ('pending','sending')) AND ${scheduled(2)}`,
      )
      .bind(id, due, Date.now())
      .run();
  // exhausted: today's quota is used up with recipients still waiting ('오늘 발송 한도를 다 썼어요…').
  return { sent, failed, pending: left, remaining, done: !left, exhausted: !!left && remaining <= 0 };
}

const RUN_BATCHES = 8; // ≤80 mails per run; the cron fires every 10 minutes
const RUN_TIME = 8 * 60000;
/** Cron: sends due scheduled newsletters, oldest first, until done, out of quota or out of this run's budget. */
export async function runScheduledNewsletters() {
  if (!configured()) return;
  const start = Date.now();
  const { results: due } = await db()
    .prepare(
      "SELECT n.id,n.scheduled_by,n.scheduled_by_name,n.site_origin,COALESCE(u.status='active' AND u.role='admin',0) AS admin FROM newsletters n LEFT JOIN users u ON u.id=n.scheduled_by WHERE n.scheduled_at<=? AND n.sent_at IS NULL ORDER BY n.scheduled_at,n.id",
    )
    .bind(start)
    .all<{ id: string; scheduled_by: string; scheduled_by_name: string; site_origin: string; admin: number }>();
  if (!due.length || (await quota()) <= 0) return;
  let batches = 0;
  const spent = () => batches >= RUN_BATCHES || Date.now() - start >= RUN_TIME;
  for (const letter of due) {
    // Whoever scheduled it lost admin (or the account) since: nobody vouches for the send any more.
    if (!letter.admin) {
      console.error('Scheduled newsletter dropped: scheduler is no longer an admin', letter.id);
      await db()
        .prepare('UPDATE newsletters SET scheduled_at=NULL,scheduled_by=NULL,scheduled_by_name=NULL WHERE id=? AND scheduled_by IS ?')
        .bind(letter.id, letter.scheduled_by)
        .run();
      continue;
    }
    const actor = { id: letter.scheduled_by, name: letter.scheduled_by_name };
    try {
      while (!spent()) {
        batches++;
        const result = await sendNextBatch(letter.id, actor, letter.site_origin, Date.now());
        if (result.exhausted) return;
        // Nothing claimed while rows still wait: cancelled, switched to manual, or another run holds them.
        if (result.done || !(result.sent + result.failed)) break;
      }
    } catch (e) {
      // Unknown outcome: those rows are already failed. Refusal: they are pending again for the next run.
      console.error('Scheduled newsletter failed', e instanceof Error ? e.message : 'Unknown error');
      // Likely an outage: pause (manual 이어서 보내기) instead of failing 10 more recipients every run.
      if (e instanceof Unconfirmed) {
        console.error('Scheduled newsletter paused', letter.id);
        await db()
          .prepare('UPDATE newsletters SET scheduled_at=NULL,scheduled_by=NULL,scheduled_by_name=NULL WHERE id=?')
          .bind(letter.id)
          .run()
          .catch(() => {});
      }
    }
    if (spent()) return;
  }
}
