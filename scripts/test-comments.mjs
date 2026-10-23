import assert from 'node:assert/strict';
import { execute, query, setRole } from './test-member-fixture.mjs';
const base = 'http://localhost:5173';
// Own users (unique ids), so concurrent runs of the shared member fixture cannot delete our sessions.
const run = Date.now().toString(36);
const staffId = `cmt-staff-${run}`,
  memberId = `cmt-member-${run}`;
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
const fixture = { cleanup: () => execute(`DELETE FROM sessions WHERE user_id IN ('${staffId}','${memberId}'); DELETE FROM users WHERE id IN ('${staffId}','${memberId}')`) };
async function request(path, { method = 'GET', body, cookie = member } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json', Origin: base } : {}), Cookie: cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() };
}
const newPost = (category) =>
  request('/api/posts', {
    method: 'POST',
    body: { title: '댓글 수정 테스트', content: '본문', author_name: '별명', password: 'Test-only-1234', category },
  });
execute('DELETE FROM attempts');
setRole(staffId, 'admin');
const postIds = [];
try {
  const bp = await newPost('board');
  const board = bp.data.id;
  const desk = (await newPost('inquiry')).data.id;
  postIds.push(board, desk);
  const add = (post, cookie, content) =>
    request(`/api/posts/${post}/comments`, { method: 'POST', cookie, body: { author_name: '별명', content } });

  const first = await add(board, member, '원래 댓글');
  assert.equal(first.status, 201, JSON.stringify(first.data));
  const mine = first.data.comment;
  const edit = (id, cookie, content) => request(`/api/comments/${id}`, { method: 'PATCH', cookie, body: { content } });
  const edited = await edit(mine.id, member, '  고친 댓글  ');
  assert.equal(edited.status, 200, 'author edits');
  assert.equal(edited.data.comment.content, '고친 댓글', 'content is trimmed');
  const listed = (await request(`/api/posts/${board}/comments`)).data.comments[0];
  assert.equal(listed.content, '고친 댓글');
  assert.ok(listed.edited_at > 0, 'edited_at is set');
  assert.equal(listed.editable, true);
  assert.equal(edited.data.comment.edited_at, listed.edited_at);
  assert.equal((await edit(mine.id, member, '   ')).status, 400, 'empty content');
  assert.equal((await edit(mine.id, member, 'a'.repeat(1001))).status, 400, 'too long');
  assert.equal((await edit(mine.id, staff, '관리자가 고침')).status, 403, 'admins cannot edit others');
  assert.equal((await request(`/api/posts/${board}/comments`, { cookie: staff })).data.comments[0].editable, false);
  assert.equal((await edit('missing', member, 'x')).status, 404);

  // Editing never changes whether a desk post counts as answered.
  const answer = (await add(desk, staff, '답변이에요')).data.comment;
  const resolved = () => query(`SELECT resolved_at FROM posts WHERE id='${desk}'`)[0].resolved_at;
  const before = resolved();
  assert.ok(before, 'staff reply resolves the desk post');
  assert.equal((await edit(answer.id, staff, '고친 답변')).status, 200);
  assert.equal(resolved(), before, 'edit keeps resolved_at');
  assert.equal((await request(`/api/posts/${desk}/comments`, { cookie: staff })).data.templates, true, 'staff get templates');
  assert.equal((await request(`/api/posts/${desk}/comments`)).data.templates, false, 'asker does not');
  console.log('comment edit tests passed');
} finally {
  for (const id of postIds) execute(`DELETE FROM comments WHERE post_id='${id}'; DELETE FROM posts WHERE id='${id}'`);
  fixture.cleanup();
}
