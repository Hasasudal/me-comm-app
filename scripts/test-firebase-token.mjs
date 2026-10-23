import assert from 'node:assert/strict';
import { verifyFirebaseIdToken } from '../lib/firebase-token.ts';

const encoder = new TextEncoder();
const projectId = 'micom-test-project';
const now = 1_800_000_000;

function base64url(value) {
  const bytes = typeof value === 'string' ? encoder.encode(value) : new Uint8Array(value);
  return Buffer.from(bytes).toString('base64url');
}

async function createKeyPair() {
  return crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
}

async function signToken(privateKey, claims, kid = 'test-key') {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid }));
  const payload = base64url(JSON.stringify(claims));
  const signingInput = `${header}.${payload}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, encoder.encode(signingInput));
  return `${signingInput}.${base64url(signature)}`;
}

const primary = await createKeyPair();
const attacker = await createKeyPair();
const publicJwk = await crypto.subtle.exportKey('jwk', primary.publicKey);
const keyProvider = async () => ({ keys: [{ ...publicJwk, kid: 'test-key', alg: 'RS256', use: 'sig' }] });
const validClaims = {
  aud: projectId,
  iss: `https://securetoken.google.com/${projectId}`,
  sub: 'firebase-user-1',
  iat: now - 10,
  auth_time: now - 60,
  exp: now + 3600,
  email: 'student@ks.ac.kr',
  email_verified: true,
  name: '김미컴',
};

async function verify(claims = validClaims, privateKey = primary.privateKey) {
  const token = await signToken(privateKey, claims);
  return verifyFirebaseIdToken(token, { projectId, now, keyProvider });
}

const identity = await verify();
assert.deepEqual(identity, {
  userId: 'firebase-user-1',
  email: 'student@ks.ac.kr',
  displayName: '김미컴',
  emailVerified: true,
  authTime: now - 60,
});

await assert.rejects(() => verify(validClaims, attacker.privateKey), /인증/);
await assert.rejects(() => verify({ ...validClaims, aud: 'other-project' }), /인증/);
await assert.rejects(() => verify({ ...validClaims, iss: 'https://securetoken.google.com/other-project' }), /인증/);
await assert.rejects(() => verify({ ...validClaims, exp: now - 1 }), /인증/);
assert.equal(
  (await verify({ ...validClaims, email_verified: false })).emailVerified,
  false,
  'unverified mail is reported',
);
await assert.rejects(() => verify({ ...validClaims, email: 'student@example.com' }), /학교 이메일/);
await assert.rejects(() => verify({ ...validClaims, email: 'student@sub.ks.ac.kr' }), /학교 이메일/);
// U+212A KELVIN SIGN lowercases to 'k', so it must be rejected before the address is lowercased.
await assert.rejects(() => verify({ ...validClaims, email: 'student@Ks.ac.kr' }), /학교 이메일/);
assert.equal((await verify({ ...validClaims, email: 'Student@KS.AC.KR' })).email, 'student@ks.ac.kr');
assert.equal(
  (await verify({ ...validClaims, name: ' ' })).displayName,
  'student',
  'a missing name falls back to the mail ID',
);

await assert.rejects(() => verify({ ...validClaims, auth_time: undefined }), /인증/, 'auth_time is required');
await assert.rejects(() => verify({ ...validClaims, auth_time: now + 3600 }), /인증/, 'future auth_time is rejected');
assert.equal(
  (await verify({ ...validClaims, name: ' 김\u202E미컴\u200B ' })).displayName,
  '김미컴',
  'hidden and bidi characters are stripped from the name',
);
assert.equal(
  (await verify({ ...validClaims, name: '\u202E\u2066' })).displayName,
  'student',
  'a name made only of hidden characters falls back to the mail ID',
);

console.log('PASS: Firebase token signature, claims, auth_time, school email and name validation.');
