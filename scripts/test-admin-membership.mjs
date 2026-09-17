import assert from 'node:assert/strict';
import { createMemberFixture } from './test-member-fixture.mjs';

const base = 'http://localhost:5173';
const adminCode = 'Local-admin-code-1234';

async function request(path, { method = 'GET', body, cookie } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json', Origin: base } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const raw = await res.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {}
  return { status: res.status, data };
}

const fixture = await createMemberFixture();
const cookie = fixture.activeCookie;

assert.equal(
  (await request('/api/admin/join', { method: 'POST', body: { code: adminCode } })).status,
  401,
  'sign-in is required',
);
assert.equal(
  (await request('/api/admin/join', { method: 'POST', cookie, body: { code: 'incorrect-admin-code' } })).status,
  403,
  'wrong code is rejected',
);
assert.equal(
  (await request('/api/admin/join', { method: 'POST', cookie, body: { code: adminCode } })).status,
  201,
  'valid code registers the signed-in account',
);

const session = await request('/api/session', { cookie });
assert.equal(session.status, 200);
assert.equal(session.data.admin, true);
assert.equal(session.data.signedIn, true);

const members = await request('/api/admin/members', { cookie });
assert.equal(members.status, 200);
assert.ok(members.data.members.some((member) => member.email === 'active@ks.ac.kr'));
assert.equal('code' in members.data, false, 'admin code is never returned');

assert.equal(
  (await request('/api/admin/members/test-member-active', { method: 'DELETE', cookie, body: {} })).status,
  400,
  'an admin cannot revoke their own account',
);

const second = fixture.secondCookie;
assert.equal(
  (await request('/api/admin/join', { method: 'POST', cookie: second, body: { code: adminCode } })).status,
  201,
  'a second member registers as admin',
);
assert.equal(
  (await request('/api/admin/members/test-member-second', { method: 'DELETE', cookie, body: {} })).status,
  200,
  'an admin revokes another admin',
);
const rejoin = await request('/api/admin/join', { method: 'POST', cookie: second, body: { code: adminCode } });
assert.equal(rejoin.status, 403, 'a revoked admin cannot rejoin with the shared code');
const roster = await request('/api/admin/members', { cookie });
assert.ok(roster.data.revoked.some((member) => member.user_id === 'test-member-second'), 'revoked admins are listed');
assert.equal(
  (await request('/api/admin/members/test-member-second', { method: 'POST', cookie: second, body: {} })).status,
  403,
  'a non-admin cannot restore',
);
assert.equal(
  (await request('/api/admin/members/test-member-second', { method: 'POST', cookie, body: {} })).status,
  200,
  'an active admin restores a revoked admin',
);
assert.equal((await request('/api/session', { cookie: second })).data.admin, true, 'restored admin regains access');

fixture.cleanup();

console.log(
  'PASS: code registration, role persistence, member listing, self-revocation protection, rejoin block and restore.',
);
