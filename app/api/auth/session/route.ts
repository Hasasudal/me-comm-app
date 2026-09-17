import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { verifyFirebaseIdToken } from '../../../../lib/firebase-token';
import {
  expiredSessionCookie,
  issueMemberSession,
  revokeCurrentSession,
  sessionCookie,
} from '../../../../lib/member-auth';
import { handle, HttpError, input, json, limit } from '../../../../lib/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return handle(async () => {
    await limit(request, 'member-session', 10);
    const { idToken } = z.object({ idToken: z.string().min(100).max(10000) }).parse(await input(request));
    const projectId = env.FIREBASE_PROJECT_ID?.trim();
    if (!projectId) throw new HttpError(503, '학교 계정 로그인이 아직 설정되지 않았습니다.');
    const identity = await verifyFirebaseIdToken(idToken, { projectId });
    const session = await issueMemberSession(identity);
    return json({ ok: true, expiresAt: session.expiresAt }, 201, { 'Set-Cookie': sessionCookie(session.token) });
  });
}

export async function DELETE(request: Request) {
  return handle(async () => {
    await revokeCurrentSession(request);
    return json({ ok: true }, 200, { 'Set-Cookie': expiredSessionCookie() });
  });
}
