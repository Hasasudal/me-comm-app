import assert from 'node:assert/strict';
import { createMemberFixture } from './test-member-fixture.mjs';

const base = 'http://localhost:5173';

async function request(path, { cookie, method='GET' }={}) {
  const response = await fetch(base + path, {
    method,
    headers: cookie ? { Cookie: cookie } : {},
  });
  const raw = await response.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {}
  return { status: response.status, data };
}

const fixture=await createMemberFixture();
try{
 const anonymous = await request('/api/posts');
 assert.equal(anonymous.status, 401, 'a visitor cannot list community posts');

 const forged = await request('/api/posts',{cookie:'micom_session=forged-session-token'});
 assert.equal(forged.status, 401, 'an unknown session cannot list community posts');

 const active = await request('/api/posts',{cookie:fixture.activeCookie});
 assert.equal(active.status,200,'an active member can list community posts');

 const expired = await request('/api/posts',{cookie:fixture.expiredCookie});
 assert.equal(expired.status,401,'an expired member session is rejected');

 const suspended = await request('/api/posts',{cookie:fixture.suspendedCookie});
 assert.equal(suspended.status,403,'a suspended member is rejected');

 const session=await request('/api/session',{cookie:fixture.activeCookie});
 assert.equal(session.status,200);assert.equal(session.data.signedIn,true);assert.equal(session.data.email,'active@ks.ac.kr');

 const logout=await request('/api/auth/session',{cookie:fixture.activeCookie,method:'DELETE'});
 assert.equal(logout.status,200,'a member can log out');
 assert.equal((await request('/api/posts',{cookie:fixture.activeCookie})).status,401,'a logged-out session cannot be reused');
} finally {
 fixture.cleanup();
}

console.log('PASS: anonymous, forged, expired, suspended and logged-out sessions are denied while active members can read.');
