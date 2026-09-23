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

  assert.equal((await post({})).status, 400, 'club posts need a club');
  assert.equal((await post({ club_id: clubId })).status, 400, 'pending club cannot take posts');

  const approve = { method: 'PATCH', body: { status: 'active' } };
  assert.equal((await request(`/api/admin/clubs/${clubId}`, approve)).status, 403, 'member cannot approve');
  assert.equal((await request(`/api/admin/clubs/${clubId}`, { ...approve, cookie: admin })).status, 200);
  assert.ok((await request('/api/clubs')).data.clubs.some((c) => c.id === clubId), 'approved club is listed');

  const created = await post({ club_id: clubId });
  assert.equal(created.status, 201, 'post into an approved club');
  postIds.push(created.data.id);
  const list = await request(`/api/posts?category=clubs&club=${clubId}`);
  assert.deepEqual(
    list.data.posts.map((p) => p.id),
    [created.data.id],
    'club tab lists only its posts',
  );
  assert.equal(list.data.posts[0].club_name, name);
  const detail = await request(`/api/posts/${created.data.id}`);
  assert.equal(detail.data.post.club_id, clubId);
  assert.equal(detail.data.post.club_name, name);
  const board = await request('/api/posts', {
    method: 'POST',
    body: { title: '자유', content: '본문', author_name: '별명', password, category: 'board', club_id: clubId },
  });
  postIds.push(board.data.id);
  assert.equal((await request(`/api/posts/${board.data.id}`)).data.post.club_id, null, 'other boards ignore club_id');
  const edit = (club_id) =>
    request(`/api/posts/${created.data.id}`, {
      method: 'PATCH',
      body: { title: '동아리 글', content: '수정', author_name: '별명', club_id },
    });
  assert.equal((await edit('missing')).status, 400, 'edit rejects an unknown club');
  assert.equal((await edit(undefined)).status, 200, 'edit without club_id keeps the club');
  assert.equal((await request(`/api/posts/${created.data.id}`)).data.post.club_id, clubId);

  const other = await request('/api/clubs', { method: 'POST', body: { name: `${name}B` } });
  const rename = (to, id = clubId) =>
    request(`/api/admin/clubs/${id}`, { method: 'PATCH', body: { name: to }, cookie: admin });
  assert.equal((await rename(`${name}B`)).status, 409, 'rename onto an existing name');
  assert.equal((await rename(`${name}2`)).status, 200);
  assert.equal(
    (await request(`/api/posts?category=clubs&club=${clubId}`)).data.posts[0].club_name,
    `${name}2`,
    'renamed club follows its posts',
  );
  assert.equal(
    (await request(`/api/admin/clubs/${clubId}`, { method: 'DELETE', body: {}, cookie: admin })).status,
    409,
    'club with posts cannot be removed',
  );
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
