import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { verifyFirebaseIdToken } from '../../../../lib/firebase-token';
import {
  expiredSessionCookie,
  issueMemberSession,
  optionalMember,
  revokeCurrentSession,
  revokeMemberSessions,
  sessionCookie,
} from '../../../../lib/member-auth';
import { handle, HttpError, input, json, limit } from '../../../../lib/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return handle(async () => {
    // Campus Wi-Fi shares one IP, so the IP cap is loose and the tight cap is per verified account.
    await limit(request, 'member-session', 120);
    const { idToken } = z.object({ idToken: z.string().min(100).max(10000) }).parse(await input(request));
    const projectId = env.FIREBASE_PROJECT_ID?.trim();
    if (!projectId) throw new HttpError(503, '로그인 기능이 아직 준비되지 않았어요. 운영진에게 알려주세요.');
    const identity = await verifyFirebaseIdToken(idToken, { projectId });
    await limit(request, 'member-session', 10, identity.userId);
    const session = await issueMemberSession(identity, request);
    return json({ ok: true, expiresAt: session.expiresAt }, 201, { 'Set-Cookie': sessionCookie(session.token) });
  });
}

export async function DELETE(request: Request) {
  return handle(async () => {
    // A bare DELETE signs out this browser; { all: true } (JSON, so input() checks Origin) signs out every device,
    // e.g. after a password reset, which Firebase does not pass on to D1 sessions.
    const all =
      request.headers.get('content-type')?.includes('application/json') &&
      z.object({ all: z.boolean().optional() }).parse(await input(request)).all;
    const member = all ? await optionalMember(request) : null;
    if (member) await revokeMemberSessions(member.userId);
    else await revokeCurrentSession(request);
    return json({ ok: true }, 200, { 'Set-Cookie': expiredSessionCookie() });
  });
}
