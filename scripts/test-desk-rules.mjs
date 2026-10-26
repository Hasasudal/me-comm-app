import assert from 'node:assert/strict';
import { execute, query, setRole } from './test-member-fixture.mjs';
const base = 'http://localhost:5173';
// Own users (unique ids), so concurrent runs of the shared member fixture cannot delete our sessions.
const run = Date.now().toString(36);
const staffId = `desk-staff-${run}`,
  memberId = `desk-member-${run}`;
const token = (id) => `${id}-${crypto.randomUUID()}`;
const tokens = { [staffId]: token(staffId), [memberId]: token(memberId) };
const sha = async (v) => Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v))).toString('hex');
const now = Date.now();
let sql = '';
for (const id of [staffId, memberId])
  sql += `INSERT INTO users (id,email,display_name,status,created_at,updated_at) VALUES ('${id}','${id}@ks.ac.kr','${id}','active',${now},${now}); INSERT INTO sessions (token_hash,user_id,created_at,expires_at) VALUES ('${await sha(tokens[id])}','${id}',${now},${now + 900_000});`;
execute(sql);
const staff = `micom_session=${tokens[staffId]}`,
  member = `micom_session=${tokens[memberId]}`;
async function request(path, { method = 'GET', body, cookie = member } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json', Origin: base } : {}), Cookie: cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() };
}
const newPost = (category, extra = {}) =>
  request('/api/posts', {
    method: 'POST',
    body: { title: '데스크 규칙 테스트', content: '본문', author_name: '별명', category, ...extra },
  });
execute('DELETE FROM attempts');
setRole(staffId, 'academic');
const postIds = [];
try {
  // Private categories take no password; a sent one is ignored and the stored hash can never match.
  for (const category of ['inquiry', 'complaint', 'news']) {
    const created = await newPost(category);
    assert.equal(created.status, 201, `${category} without password: ${JSON.stringify(created.data)}`);
    postIds.push(created.data.id);
  }
  const ignored = await newPost('inquiry', { password: 'x' });
  assert.equal(ignored.status, 201, 'a short password on a private post is ignored');
  postIds.push(ignored.data.id);
  assert.equal(query(`SELECT password_hash FROM posts WHERE id='${ignored.data.id}'`)[0].password_hash, '!');
  const board = await newPost('board');
  assert.equal(board.status, 400, 'public board still needs a password');
  assert.match(board.data.error, /글 비밀번호/);
  assert.equal((await newPost('board', { password: 'short' })).status, 400, 'public password rules kept');

  const desk = postIds[0];
  // Staff can't manage the student's post, password or not.
  const edit = await request(`/api/posts/${desk}`, {
    method: 'PATCH',
    cookie: staff,
    body: { title: '수정', content: '본문', author_name: '별명', password: 'Test-only-1234' },
  });
  assert.equal(edit.status, 403);
  assert.equal(edit.data.error, '이 글은 작성자와 관리자만 수정·삭제할 수 있어요.');
  assert.equal((await request(`/api/posts/${desk}`, { method: 'DELETE', cookie: staff, body: {} })).status, 403);

  const add = (cookie, content, extra = {}) =>
    request(`/api/posts/${desk}/comments`, { method: 'POST', cookie, body: { author_name: '별명', content, ...extra } });
  const resolved = () => query(`SELECT resolved_at FROM posts WHERE id='${desk}'`)[0].resolved_at;
  const interim = await add(staff, '확인 중이에요', { resolve: false });
  assert.equal(interim.status, 201, JSON.stringify(interim.data));
  assert.equal(resolved(), null, 'interim staff reply leaves the post waiting');
  const final = (await add(staff, '답변이에요')).data.comment;
  assert.ok(resolved(), 'staff reply resolves by default');
  assert.equal((await request(`/api/comments/${final.id}`, { method: 'DELETE', cookie: staff, body: {} })).status, 200);
  assert.equal(resolved(), null, 'only the interim reply is left, so the post waits again');
  await add(staff, '다시 답변이에요');
  assert.ok(resolved());
  await add(member, '추가 질문이에요', { resolve: true });
  assert.equal(resolved(), null, 'author follow-up reopens');
  console.log('desk rules tests passed');
} finally {
  for (const id of postIds) execute(`DELETE FROM comments WHERE post_id='${id}'; DELETE FROM posts WHERE id='${id}'`);
  execute(`DELETE FROM sessions WHERE user_id IN ('${staffId}','${memberId}'); DELETE FROM users WHERE id IN ('${staffId}','${memberId}')`);
}
