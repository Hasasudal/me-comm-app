const FIREBASE_JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const CLOCK_SKEW_SECONDS = 300;

type FirebaseJwk = JsonWebKey & { kid?: string; alg?: string; use?: string };
type FirebaseKeySet = { keys: FirebaseJwk[] };
type KeyProvider = (options?: { force?: boolean }) => Promise<FirebaseKeySet>;
type VerifyOptions = { projectId: string; now?: number; keyProvider?: KeyProvider };
type TokenHeader = { alg?: unknown; kid?: unknown };
type TokenClaims = {
  aud?: unknown;
  iss?: unknown;
  sub?: unknown;
  iat?: unknown;
  exp?: unknown;
  email?: unknown;
  email_verified?: unknown;
  name?: unknown;
};

export type FirebaseIdentity = { userId: string; email: string; displayName: string; emailVerified: boolean };

export class FirebaseTokenError extends Error {
  constructor(message = '로그인 인증을 확인해주세요.') {
    super(message);
    this.name = 'FirebaseTokenError';
  }
}

let cachedKeys: { value: FirebaseKeySet; expiresAt: number } | null = null;

function decodeBase64Url(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new FirebaseTokenError();
  const base64 = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    throw new FirebaseTokenError();
  }
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function decodeJson<T>(value: string): T {
  try {
    return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as T;
  } catch {
    throw new FirebaseTokenError();
  }
}

function cacheSeconds(header: string | null) {
  const match = header?.match(/(?:^|,)\s*max-age=(\d+)/i);
  return match ? Math.max(60, Number(match[1])) : 300;
}

async function fetchFirebaseKeys({ force = false }: { force?: boolean } = {}): Promise<FirebaseKeySet> {
  const now = Date.now();
  if (!force && cachedKeys && cachedKeys.expiresAt > now) return cachedKeys.value;
  const response = await fetch(FIREBASE_JWKS_URL, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new FirebaseTokenError('로그인 인증 서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.');
  const value = (await response.json()) as FirebaseKeySet;
  if (!Array.isArray(value.keys) || !value.keys.length)
    throw new FirebaseTokenError('로그인 인증 서버 응답을 확인할 수 없습니다.');
  cachedKeys = { value, expiresAt: now + cacheSeconds(response.headers.get('cache-control')) * 1000 };
  return value;
}

async function findKey(kid: string, provider: KeyProvider) {
  let set = await provider();
  let key = set.keys.find((item) => item.kid === kid);
  if (!key) {
    set = await provider({ force: true });
    key = set.keys.find((item) => item.kid === kid);
  }
  if (!key || (key.alg && key.alg !== 'RS256') || (key.use && key.use !== 'sig')) throw new FirebaseTokenError();
  return key;
}

export async function verifyFirebaseIdToken(token: string, options: VerifyOptions): Promise<FirebaseIdentity> {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts.every(Boolean)) throw new FirebaseTokenError();
  const header = decodeJson<TokenHeader>(parts[0]);
  const claims = decodeJson<TokenClaims>(parts[1]);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid) throw new FirebaseTokenError();
  const jwk = await findKey(header.kid, options.keyProvider || fetchFirebaseKeys);
  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  } catch {
    throw new FirebaseTokenError();
  }
  const verified = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    decodeBase64Url(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  if (!verified) throw new FirebaseTokenError();

  const now = options.now ?? Math.floor(Date.now() / 1000);
  if (claims.aud !== options.projectId || claims.iss !== `https://securetoken.google.com/${options.projectId}`)
    throw new FirebaseTokenError();
  if (typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 128) throw new FirebaseTokenError();
  if (typeof claims.iat !== 'number' || claims.iat > now + CLOCK_SKEW_SECONDS) throw new FirebaseTokenError();
  if (typeof claims.exp !== 'number' || claims.exp <= now) throw new FirebaseTokenError();
  if (typeof claims.email !== 'string') throw new FirebaseTokenError();

  const email = claims.email.trim().toLowerCase();
  if (!/^[^@\s]+@ks\.ac\.kr$/.test(email)) throw new FirebaseTokenError('인증된 경성대학교 학교 이메일이 필요합니다.');
  const displayName = typeof claims.name === 'string' ? claims.name.trim() : '';
  if (displayName.length < 2 || displayName.length > 40) throw new FirebaseTokenError('회원 이름을 확인해주세요.');
  return { userId: claims.sub, email, displayName, emailVerified: claims.email_verified === true };
}
