import assert from 'node:assert/strict';
import { createMemberFixture, setRole } from './test-member-fixture.mjs';

const base = 'http://localhost:5173';
async function request(path, { method = 'GET', body, cookie } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json', Origin: base } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const raw = await response.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {}
  return { status: response.status, data };
}

const fixture = await createMemberFixture();
assert.equal(
  (await request('/api/account', { method: 'PATCH', body: { idToken: 'invalid' } })).status,
  401,
  'anonymous profile update is denied',
);
assert.equal(
  (await request('/api/account', { method: 'PATCH', cookie: fixture.activeCookie, body: { idToken: 'x'.repeat(120) } }))
    .status,
  401,
  'unverified Firebase identity is denied',
);
assert.equal(
  (await request('/api/account', { method: 'DELETE', cookie: fixture.activeCookie, body: { confirm: '잘못된 문구' } }))
    .status,
  400,
  'account deletion requires the exact phrase',
);
const withdraw = (body) => request('/api/account', { method: 'DELETE', cookie: fixture.activeCookie, body });
assert.equal((await withdraw({ confirm: '회원탈퇴', dryRun: true })).status, 200, 'the pre-check needs no token');
// Withdrawal needs a Firebase ID token from a password entry in the last 5 minutes. Tests cannot mint one that the
// real Google keys accept, so the success path (content credited to '탈퇴한 회원') is checked by hand in the browser.
const noToken = await withdraw({ confirm: '회원탈퇴' });
assert.equal(noToken.status, 403, 'a session cookie alone cannot withdraw');
assert.match(noToken.data.error, /비밀번호를 다시 확인/);
assert.equal((await withdraw({ confirm: '회원탈퇴', idToken: 'x'.repeat(120) })).status, 401, 'a forged token is refused');
assert.equal(
  (await request('/api/session', { cookie: fixture.activeCookie })).data.signedIn,
  true,
  'refused withdrawals keep the account',
);
fixture.cleanup();

const adminFixture = await createMemberFixture();
setRole('test-member-active', 'admin');
assert.equal(
  (await request('/api/admin/users', { cookie: adminFixture.secondCookie })).status,
  403,
  'regular member cannot list users',
);
let users = await request('/api/admin/users?q=second', { cookie: adminFixture.activeCookie });
assert.equal(users.status, 200);
assert.equal(users.data.users.length, 1);
assert.equal(users.data.users[0].email, 'second@ks.ac.kr');
assert.equal(
  (
    await request('/api/admin/users/test-member-active', {
      method: 'PATCH',
      cookie: adminFixture.activeCookie,
      body: { status: 'suspended' },
    })
  ).status,
  400,
  'administrator cannot suspend their own account',
);
assert.equal(
  (
    await request('/api/admin/users/test-member-second', {
      method: 'PATCH',
      cookie: adminFixture.activeCookie,
      body: { status: 'suspended' },
    })
  ).status,
  200,
  'administrator can suspend another member',
);
assert.equal(
  (await request('/api/posts', { cookie: adminFixture.secondCookie })).status,
  401,
  'suspension revokes existing sessions immediately',
);
users = await request('/api/admin/users?status=suspended', { cookie: adminFixture.activeCookie });
assert.ok(users.data.users.some((user) => user.id === 'test-member-second' && user.status === 'suspended'));
assert.equal(
  (
    await request('/api/admin/users/test-member-second', {
      method: 'PATCH',
      cookie: adminFixture.activeCookie,
      body: { status: 'active' },
    })
  ).status,
  200,
  'administrator can restore a member',
);
assert.equal(
  (await request('/api/posts', { cookie: adminFixture.secondCookie })).status,
  401,
  'restored account must sign in again',
);
adminFixture.cleanup();

console.log('PASS: withdrawal re-auth, administrator member search, suspension, session revocation and restoration.');
