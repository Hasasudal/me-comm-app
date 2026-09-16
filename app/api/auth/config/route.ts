import { env } from 'cloudflare:workers';
import { json } from '../../../../lib/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const config = {
    apiKey: env.FIREBASE_API_KEY,
    authDomain: env.FIREBASE_AUTH_DOMAIN,
    projectId: env.FIREBASE_PROJECT_ID,
    appId: env.FIREBASE_APP_ID,
  };
  if (Object.values(config).some((value) => !value)) {
    return json({ error: '학교 계정 로그인이 아직 설정되지 않았습니다.' }, 503);
  }
  return json(config);
}
