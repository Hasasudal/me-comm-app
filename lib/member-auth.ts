import { db } from './database';
import { HttpError } from './http-error';

const COOKIE_NAME = 'micom_session';
const MAX_SESSIONS = 5;
const SESSION_SECONDS = 60 * 60 * 24 * 14;

export type Role = 'member' | 'academic' | 'council' | 'admin';
export type Member = {
  userId: string;
  email: string;
  displayName: string;
  status: 'active' | 'suspended';
  role: Role;
};

type MemberRow = {
  user_id: string;
  email: string;
  display_name: string;
  status: 'active' | 'suspended';
  role: Role;
  expires_at: number;
};

function cookieValue(request: Request, name: string) {
  const source = request.headers.get('cookie');
  if (!source) return null;
  for (const part of source.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=') || null;
  }
  return null;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export function sessionCookie(token: string) {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_SECONDS}`;
}

export function expiredSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function optionalMember(request: Request): Promise<Member | null> {
  const token = cookieValue(request, COOKIE_NAME);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const now = Date.now();
  const row = await db()
    .prepare(
      'SELECT sessions.user_id,users.email,users.display_name,users.status,users.role,sessions.expires_at FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token_hash=?',
    )
    .bind(tokenHash)
    .first<MemberRow>();
  if (!row) return null;
  if (row.expires_at <= now) {
    await db().prepare('DELETE FROM sessions WHERE token_hash=?').bind(tokenHash).run();
    return null;
  }
  if (row.status === 'suspended') {
    await db().prepare('DELETE FROM sessions WHERE user_id=?').bind(row.user_id).run();
    throw new HttpError(
      403,
      '이용이 정지된 계정이에요. 학과 사무실이나 미컴봇(카카오톡 ‘경성대 미컴봇’)으로 문의해주세요.',
    );
  }
  return {
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    status: row.status,
    role: row.role,
  };
}

export async function requireMember(request: Request) {
  const member = await optionalMember(request);
  if (!member) throw new HttpError(401, '로그인이 필요해요. 학교 이메일로 로그인해주세요.');
  return member;
}

type Identity = { userId: string; email: string; displayName: string; emailVerified: boolean };
const PENDING_MESSAGE =
  '학교 이메일 인증이 안 된 계정이라 운영진 승인을 기다리고 있어요. 승인되면 다시 로그인해주세요. 인증 메일의 링크를 눌러도 바로 이용할 수 있어요.';

// A school address whose verification mail never arrived can still ask to join: it is recorded as 'pending'
// until an admin approves it (status 'active') or turns it down (row deleted). Verified mail skips the wait.
// Pending rows start unsubscribed and an admin's approval keeps it that way (the address is still unverified);
// verifying it later subscribes them like any verified sign-up. Members can always opt in from the account page.
// Requests nobody approved within PENDING_DAYS are dropped on the next unverified sign-in, so an abandoned (or
// squatted) address frees itself even if no admin ever looks.
const PENDING_DAYS = 30;
export async function issueMemberSession(identity: Identity, request?: Request) {
  if (!identity.emailVerified)
    await db()
      .prepare("DELETE FROM users WHERE status='pending' AND created_at<?")
      .bind(Date.now() - PENDING_DAYS * 24 * 60 * 60 * 1000)
      .run();
  const existing = await db()
    .prepare('SELECT id,email,status FROM users WHERE id=? OR email=?')
    .bind(identity.userId, identity.email)
    .all<{ id: string; email: string; status: string }>();
  // A pending row only shows someone typed the address; a verified token proves the mailbox, so it takes the address
  // over (otherwise anyone could sign up with a classmate's mail, delete the Firebase account and lock them out).
  const conflicts = existing.results.filter((row) => row.id !== identity.userId);
  const squatted = identity.emailVerified && conflicts.length > 0 && conflicts.every((row) => row.status === 'pending');
  if (conflicts.length && !squatted)
    throw new HttpError(409, '이미 다른 계정에서 쓰고 있는 학교 이메일이에요. 다른 이메일을 입력해주세요.');
  const current = existing.results.find((row) => row.id === identity.userId);
  if (current?.status === 'suspended')
    throw new HttpError(
      403,
      '이용이 정지된 계정이에요. 학과 사무실이나 미컴봇(카카오톡 ‘경성대 미컴봇’)으로 문의해주세요.',
    );
  // An unverified token must never move the stored address, or a member could claim someone else's mailbox.
  if (!identity.emailVerified && current && current.email !== identity.email)
    throw new HttpError(403, '변경한 학교 이메일의 인증이 필요해요. 인증 메일의 링크를 누른 뒤 다시 로그인해주세요.');
  if (!identity.emailVerified && current?.status !== 'active') {
    if (!current) {
      const now = Date.now();
      await db()
        .prepare(
          "INSERT INTO users (id,email,display_name,status,newsletter,suspended_at,created_at,updated_at) VALUES (?,?,?,'pending',0,NULL,?,?)",
        )
        .bind(identity.userId, identity.email, identity.displayName, now, now)
        .run();
    }
    throw new HttpError(403, PENDING_MESSAGE);
  }
  const token = randomToken(),
    tokenHash = await sha256(token),
    now = Date.now(),
    expiresAt = now + SESSION_SECONDS * 1000,
    previous = request && cookieValue(request, COOKIE_NAME);
  await db().batch([
    ...(squatted
      ? [
          db()
            .prepare(
              "DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email=? AND id<>? AND status='pending')",
            )
            .bind(identity.email, identity.userId),
          db()
            .prepare("DELETE FROM users WHERE email=? AND id<>? AND status='pending'")
            .bind(identity.email, identity.userId),
        ]
      : []),
    // Signing in again on this browser replaces its old session instead of leaving it orphaned.
    ...(previous
      ? [
          db()
            .prepare('DELETE FROM sessions WHERE token_hash=?')
            .bind(await sha256(previous)),
        ]
      : []),
    db()
      .prepare(
        "INSERT INTO users (id,email,display_name,status,suspended_at,created_at,updated_at) VALUES (?,?,?,'active',NULL,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,display_name=excluded.display_name,newsletter=CASE WHEN users.status='pending' THEN 1 ELSE users.newsletter END,status=CASE WHEN users.status='pending' THEN 'active' ELSE users.status END,updated_at=excluded.updated_at",
      )
      .bind(identity.userId, identity.email, identity.displayName, now, now),
    // Keep other devices signed in: drop expired sessions and cap each member at MAX_SESSIONS.
    db().prepare('DELETE FROM sessions WHERE expires_at<=?').bind(now),
    db()
      .prepare(
        'DELETE FROM sessions WHERE user_id=? AND token_hash NOT IN (SELECT token_hash FROM sessions WHERE user_id=? ORDER BY created_at DESC LIMIT ?)',
      )
      .bind(identity.userId, identity.userId, MAX_SESSIONS - 1),
    db()
      .prepare('INSERT INTO sessions (token_hash,user_id,created_at,expires_at) VALUES (?,?,?,?)')
      .bind(tokenHash, identity.userId, now, expiresAt),
  ]);
  return { token, expiresAt };
}

export async function revokeCurrentSession(request: Request) {
  const token = cookieValue(request, COOKIE_NAME);
  if (!token) return;
  await db()
    .prepare('DELETE FROM sessions WHERE token_hash=?')
    .bind(await sha256(token))
    .run();
}

export async function revokeMemberSessions(userId: string) {
  await db().prepare('DELETE FROM sessions WHERE user_id=?').bind(userId).run();
}
