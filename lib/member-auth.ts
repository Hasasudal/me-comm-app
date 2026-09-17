import { db } from './database';
import { HttpError } from './http-error';

const COOKIE_NAME = 'micom_session';
const SESSION_SECONDS = 60 * 60 * 24 * 14;

export type Member = { userId: string; email: string; displayName: string; status: 'active' | 'suspended' };

type MemberRow = {
  user_id: string;
  email: string;
  display_name: string;
  status: 'active' | 'suspended';
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
      'SELECT sessions.user_id,users.email,users.display_name,users.status,sessions.expires_at FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token_hash=?',
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
    throw new HttpError(403, '이용이 정지된 계정입니다. 관리자에게 문의해주세요.');
  }
  return { userId: row.user_id, email: row.email, displayName: row.display_name, status: row.status };
}

export async function requireMember(request: Request) {
  const member = await optionalMember(request);
  if (!member) throw new HttpError(401, '학교 계정 로그인이 필요합니다.');
  return member;
}

export async function issueMemberSession(identity: { userId: string; email: string; displayName: string }) {
  const existing = await db()
    .prepare('SELECT id,status FROM users WHERE id=? OR email=?')
    .bind(identity.userId, identity.email)
    .all<{ id: string; status: string }>();
  const conflict = existing.results.find((row) => row.id !== identity.userId);
  if (conflict) throw new HttpError(409, '이미 다른 계정에서 사용 중인 학교 이메일입니다.');
  const current = existing.results.find((row) => row.id === identity.userId);
  if (current?.status === 'suspended') throw new HttpError(403, '이용이 정지된 계정입니다. 관리자에게 문의해주세요.');
  const token = randomToken(),
    tokenHash = await sha256(token),
    now = Date.now(),
    expiresAt = now + SESSION_SECONDS * 1000;
  await db().batch([
    db()
      .prepare(
        "INSERT INTO users (id,email,display_name,status,suspended_at,created_at,updated_at) VALUES (?,?,?,'active',NULL,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,display_name=excluded.display_name,updated_at=excluded.updated_at",
      )
      .bind(identity.userId, identity.email, identity.displayName, now, now),
    db().prepare('DELETE FROM sessions WHERE user_id=? OR expires_at<=?').bind(identity.userId, now),
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
