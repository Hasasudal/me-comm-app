import assert from 'node:assert/strict';
import { createMemberFixture, execute, setRole } from './test-member-fixture.mjs';
const base = 'http://localhost:5173';
const password = 'Test-only-1234';
const fixture = await createMemberFixture();
const admin = fixture.activeCookie,
  member = fixture.secondCookie;
async function request(path, { method = 'GET', body, cookie = member } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json', Origin: base } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() };
}
const post = (body) =>
  request('/api/posts', {
    method: 'POST',
    body: { title: '동아리 글', content: '본문', author_name: '별명', password, category: 'clubs', ...body },
  });
execute('DELETE FROM attempts'); // runs back to back would otherwise share rate-limit windows
setRole('test-member-active', 'admin');
const name = `테스트동아리${Date.now() % 100000}`;
const postIds = [];
let clubId;
try {
  assert.equal((await request('/api/clubs', { cookie: '' })).status, 401, 'anonymous list is denied');
  const applied = await request('/api/clubs', { method: 'POST', body: { name: `  ${name}  ` } });
  assert.equal(applied.status, 201, 'member applies');
  clubId = applied.data.id;
  assert.equal((await request('/api/clubs', { method: 'POST', body: { name } })).status, 409, 'duplicate name');
  assert.equal((await request('/api/clubs', { method: 'POST', body: { name: '' } })).status, 400, 'empty name');
  assert.ok(!(await request('/api/clubs')).data.clubs.some((c) => c.id === clubId), 'pending club is hidden');
  assert.equal((await request('/api/admin/clubs')).status, 403, 'member cannot list for review');
  const review = await request('/api/admin/clubs', { cookie: admin });
  const pending = review.data.clubs.find((c) => c.id === clubId);
  assert.equal(pending.status, 'pending');
  assert.equal(pending.name, name, 'name is trimmed');
  assert.equal(pending.requested_by_name, '두번째회원');

  // Task 3 assertions (club posts) are added below this line.

  const approve = { method: 'PATCH', body: { status: 'active' } };
  assert.equal((await request(`/api/admin/clubs/${clubId}`, approve)).status, 403, 'member cannot approve');
  assert.equal((await request(`/api/admin/clubs/${clubId}`, { ...approve, cookie: admin })).status, 200);
  assert.ok((await request('/api/clubs')).data.clubs.some((c) => c.id === clubId), 'approved club is listed');

  const other = await request('/api/clubs', { method: 'POST', body: { name: `${name}B` } });
  const rename = (to, id = clubId) =>
    request(`/api/admin/clubs/${id}`, { method: 'PATCH', body: { name: to }, cookie: admin });
  assert.equal((await rename(`${name}B`)).status, 409, 'rename onto an existing name');
  assert.equal((await rename(`${name}2`)).status, 200);
  assert.equal((await rename('x', 'missing')).status, 404);
  assert.equal(
    (await request(`/api/admin/clubs/${other.data.id}`, { method: 'DELETE', body: {}, cookie: admin })).status,
    200,
    'reject a pending request',
  );
  console.log('club tests passed');
} finally {
  for (const id of postIds) execute(`DELETE FROM posts WHERE id='${id}'`);
  execute(`DELETE FROM clubs WHERE name LIKE '${name}%'`);
  fixture.cleanup();
}
