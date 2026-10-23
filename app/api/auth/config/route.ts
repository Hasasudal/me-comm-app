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
    return json({ error: '로그인 기능이 아직 준비되지 않았어요. 운영진에게 알려주세요.' }, 503);
  }
  return json(config);
}
