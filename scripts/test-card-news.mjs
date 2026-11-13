import assert from 'node:assert/strict';
import { execute, setRole } from './test-member-fixture.mjs';
const base = 'http://localhost:5173';
// Own users (unique ids), so concurrent runs of the shared member fixture cannot delete our sessions.
const run = Date.now().toString(36);
const adminId = `cn-admin-${run}`,
  memberId = `cn-member-${run}`;
const token = (id) => `${id}-${crypto.randomUUID()}`;
const tokens = { [adminId]: token(adminId), [memberId]: token(memberId) };
const sha = async (v) =>
  Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v))).toString('hex');
const now = Date.now();
let sql = '';
for (const id of [adminId, memberId])
  sql += `INSERT INTO users (id,email,display_name,status,created_at,updated_at) VALUES ('${id}','${id}@ks.ac.kr','${id}','active',${now},${now}); INSERT INTO sessions (token_hash,user_id,created_at,expires_at) VALUES ('${await sha(tokens[id])}','${id}',${now},${now + 900_000});`;
execute(sql);
const admin = `micom_session=${tokens[adminId]}`,
  member = `micom_session=${tokens[memberId]}`;
// Returns the raw Response (body already read as text) so header checks are possible.
async function request(path, { method = 'GET', body, cookie = member } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json', Origin: base } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {}
  return { status: res.status, headers: res.headers, text, data };
}
execute('DELETE FROM attempts');
setRole(adminId, 'admin');
const ids = [];
try {
  // 1. Auth gates
  const html = `<!doctype html><html><body><script>document.title='x'</script><h1>카드</h1></body></html>`;
  assert.equal(
    (await request('/api/card-news', { method: 'POST', body: { title: 't', html } })).status,
    403,
    'member upload',
  );
  assert.equal((await request('/api/card-news', { cookie: null })).status, 401, 'anonymous list');

  // 2. Upload validation
  const up = await request('/api/card-news', {
    method: 'POST',
    cookie: admin,
    body: { title: '테스트 카드뉴스', html },
  });
  assert.equal(up.status, 201, JSON.stringify(up.data));
  const id = up.data.id;
  assert.ok(id);
  ids.push(id);
  assert.equal(
    (await request('/api/card-news', { method: 'POST', cookie: admin, body: { html } })).status,
    400,
    'missing title',
  );
  for (const size of [10 * 1024 * 1024 + 10, 13 * 1024 * 1024]) {
    const big = await request('/api/card-news', {
      method: 'POST',
      cookie: admin,
      body: { title: '큰 파일', html: `<p>${'a'.repeat(size)}</p>` },
    });
    assert.equal(big.status, 413, `oversize ${size}: ${big.status} ${big.text.slice(0, 200)}`);
  }

  // 3. List / meta
  const list = await request('/api/card-news');
  assert.equal(list.status, 200);
  const item = list.data.items.find((i) => i.id === id);
  assert.ok(item, 'item listed');
  assert.equal(item.title, '테스트 카드뉴스');
  // The uploader's account name reaches admins only.
  assert.ok(!('author_name' in item) && !('author_id' in item), 'members get no uploader identity');
  const adminList = await request('/api/card-news', { cookie: admin });
  assert.equal(adminList.data.items.find((i) => i.id === id)?.author_name, adminId, 'admins see the uploader');
  const meta = await request(`/api/card-news/${id}`);
  assert.equal(meta.status, 200);
  assert.equal(meta.data.item.id, id);
  assert.ok(!('author_name' in meta.data.item) && !('author_id' in meta.data.item), 'no uploader identity in meta');
  assert.equal((await request('/api/card-news/nope')).status, 404, 'bad id');

  // 4. Raw HTML + headers
  assert.equal((await request(`/api/card-news/${id}/raw`, { cookie: null })).status, 401, 'anonymous raw');
  const raw = await request(`/api/card-news/${id}/raw`);
  assert.equal(raw.status, 200);
  const h = (name) => raw.headers.get(name);
  assert.ok(h('content-type').startsWith('text/html'), h('content-type'));
  assert.ok(raw.text.includes('<h1>카드</h1>'), 'body');
  const csp = h('content-security-policy');
  assert.ok(csp.includes('sandbox allow-scripts'), csp);
  assert.ok(!csp.includes('allow-same-origin'), 'no allow-same-origin');
  assert.ok(!csp.includes("frame-ancestors 'none'"), csp);
  assert.ok(!csp.includes('recaptcha'), 'site CSP must not be merged in');
  assert.ok(!csp.includes(', '), `exactly one CSP value: ${csp}`);
  assert.equal(h('x-frame-options'), 'SAMEORIGIN');
  assert.equal(h('x-content-type-options'), 'nosniff');
  // A direct visit (top-level document) is sent to the viewer page instead of serving the HTML.
  const direct = await fetch(`${base}/api/card-news/${id}/raw`, {
    headers: { Cookie: member, 'Sec-Fetch-Dest': 'document' },
    redirect: 'manual',
  });
  assert.equal(direct.status, 303, 'direct visit redirects');
  assert.equal(new URL(direct.headers.get('location'), base).pathname, `/sisa/${id}`);

  // 5. Site page CSP allows framing the raw route
  const page = await request('/sisa');
  assert.equal(page.status, 200, 'GET /sisa');
  assert.match(page.headers.get('content-security-policy') ?? '', /frame-src [^;]*'self'/);

  // 6. Delete
  assert.equal((await request(`/api/card-news/${id}`, { method: 'DELETE', body: {} })).status, 403, 'member delete');
  assert.equal(
    (await request(`/api/card-news/${id}`, { method: 'DELETE', cookie: admin, body: {} })).status,
    200,
    'admin delete',
  );
  assert.equal((await request(`/api/card-news/${id}/raw`)).status, 404, 'raw after delete');
  assert.equal((await request(`/api/card-news/${id}`)).status, 404, 'meta after delete');
  console.log('card news tests passed');
} finally {
  const users = `'${adminId}','${memberId}'`;
  execute(
    `DELETE FROM card_news WHERE author_id IN (${users}); DELETE FROM sessions WHERE user_id IN (${users}); DELETE FROM users WHERE id IN (${users})`,
  );
}
