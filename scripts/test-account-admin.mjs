import assert from 'node:assert/strict';
import { createMemberFixture, query } from './test-member-fixture.mjs';

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
const post = (fields) =>
  request('/api/posts', {
    method: 'POST',
    cookie: fixture.activeCookie,
    body: { title: '탈퇴 테스트', content: '본문', author_name: '원래이름', password: 'password123', ...fields },
  }).then((r) => r.data.id);
const boardId = await post({ category: 'board' });
const newsId = await post({ category: 'news' });
await request(`/api/posts/${boardId}/comments`, {
  method: 'POST',
  cookie: fixture.activeCookie,
  body: { author_name: '원래이름', content: '댓글' },
});
assert.equal(
  (await request('/api/account', { method: 'DELETE', cookie: fixture.activeCookie, body: { confirm: '회원탈퇴' } }))
    .status,
  200,
  'member can delete their account',
);
const session = await request('/api/session', { cookie: fixture.activeCookie });
assert.equal(session.data.signedIn, false, 'deleted account session cannot be reused');
const kept = (await request(`/api/posts/${boardId}`, { cookie: fixture.secondCookie })).data.post;
assert.equal(kept.author_name, '탈퇴한 회원', 'posts stay, credited to a withdrawn member');
const [comment] = (await request(`/api/posts/${boardId}/comments`, { cookie: fixture.secondCookie })).data.comments;
assert.equal(comment.author_name, '탈퇴한 회원', 'comments stay, credited to a withdrawn member');
assert.equal(query(`SELECT id FROM posts WHERE id='${newsId}'`).length, 0, 'unfinished news is removed');
assert.equal(
  query("SELECT id FROM posts WHERE author_id='test-member-active'").length,
  0,
  'no content keeps the old id',
);
query(`DELETE FROM posts WHERE id='${boardId}'`);
fixture.cleanup();

const adminFixture = await createMemberFixture();
const adminCode = 'Local-admin-code-1234';
assert.equal(
  (await request('/api/admin/join', { method: 'POST', cookie: adminFixture.activeCookie, body: { code: adminCode } }))
    .status,
  201,
);
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

console.log('PASS: account deletion, administrator member search, suspension, session revocation and restoration.');
