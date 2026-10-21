// Newsletter API test. Needs the dev server (npm run dev) and these lines in .dev.vars, so the Worker talks to the
// mock Apps Script this script starts on 127.0.0.1:5199 (mirrors docs/newsletter/Code.gs):
//   NEWSLETTER_SCRIPT_URL=http://127.0.0.1:5199
//   NEWSLETTER_SCRIPT_SECRET=local-newsletter-secret
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createMemberFixture, execute, query, setRole } from './test-member-fixture.mjs';

const base = 'http://localhost:5173';
// mode (one send call): 'html' mails the batch then answers with an HTML page (outcome unknown to the Worker);
// 'reject' refuses the call before mailing anyone, like a bad secret or request.
const mock = { remaining: 100, sent: [], mode: null };
const server = createServer((req, res) => {
  let raw = '';
  req.on('data', (chunk) => (raw += chunk));
  req.on('end', () => {
    const reply = (value) => res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(value));
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return reply({ ok: false, error: 'bad_request' });
    }
    if (body.secret !== 'local-newsletter-secret') return reply({ ok: false, error: 'unauthorized' });
    if (body.action === 'quota') return reply({ ok: true, remaining: mock.remaining });
    if (body.action !== 'send' || !Array.isArray(body.messages) || !body.messages.length || body.messages.length > 20)
      return reply({ ok: false, error: 'bad_request' });
    const mode = mock.mode;
    mock.mode = null;
    if (mode === 'reject') return reply({ ok: false, error: 'bad_request' });
    const results = body.messages.map((m) => {
      const to = String(m.to).trim();
      if (m.html.length > 200000) return { to, ok: false, error: 'too_large' };
      if (mock.remaining <= 0) return { to, ok: false, error: 'quota' };
      mock.remaining--;
      mock.sent.push({ to, subject: m.subject, html: m.html });
      return { to, ok: true };
    });
    if (mode === 'html') return res.writeHead(200, { 'Content-Type': 'text/html' }).end('<html>오류</html>');
    reply({ ok: true, results, remaining: mock.remaining });
  });
});
await new Promise((resolve) => server.listen(5199, '127.0.0.1', resolve));

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
setRole('test-member-active', 'admin');
const admin = fixture.activeCookie;
const created = [];
const create = async (subject, html = '<p>본문</p>') => {
  const r = await request('/api/admin/newsletters', { method: 'POST', cookie: admin, body: { subject, html } });
  assert.equal(r.status, 200, 'admin can create a newsletter');
  created.push(r.data.id);
  return r.data.id;
};
const send = (id) => request(`/api/admin/newsletters/${id}/send`, { method: 'POST', cookie: admin, body: {} });
const finish = async (id) => {
  let r;
  do {
    r = await send(id);
    assert.equal(r.status, 200);
  } while (!r.data.done);
};
const deliveries = (id) => query(`SELECT user_id,status,error FROM newsletter_deliveries WHERE newsletter_id='${id}'`);
const mailed = (subject) => mock.sent.filter((m) => m.subject === subject).map((m) => m.to);
try {
  assert.equal((await request('/api/admin/newsletters', { cookie: fixture.secondCookie })).status, 403, 'members cannot list');
  assert.equal(
    (await request('/api/admin/newsletters', { method: 'POST', cookie: fixture.secondCookie, body: { subject: 'x', html: 'x' } }))
      .status,
    403,
    'members cannot create',
  );

  // Subscribed by default; a member can turn it off from the account page.
  assert.equal((await request('/api/session', { cookie: fixture.secondCookie })).data.newsletter, true, 'on by default');
  const off = await request('/api/account', { method: 'PATCH', cookie: fixture.secondCookie, body: { newsletter: false } });
  assert.equal(off.status, 200, 'newsletter can be changed alone');
  assert.equal((await request('/api/session', { cookie: fixture.secondCookie })).data.newsletter, false, 'session reflects it');

  const list = await request('/api/admin/newsletters', { cookie: admin });
  assert.equal(list.status, 200);
  assert.equal(list.data.configured, true, '.dev.vars must point at the mock (see the top of this file)');
  assert.equal(list.data.remaining, 100);

  const id = await create('3월 소식', '<html><body><p onclick="alert(1)">안녕</p><script>alert(1)</script></body></html>');
  const [stored] = query(`SELECT html FROM newsletters WHERE id='${id}'`);
  assert.ok(!/script|onclick/i.test(stored.html), 'scripts and handlers are stripped');
  assert.match(stored.html, /<p>안녕<\/p>/);
  const tricky = await create('위생', `<img src="x"/onerror="alert(1)"><a href=" javascript:alert(1)">a</a><img src='javascript:x'>`);
  const [cleaned] = query(`SELECT html FROM newsletters WHERE id='${tricky}'`);
  assert.ok(!/onerror|javascript:/i.test(cleaned.html), '/onerror= and javascript: URLs are neutralised');
  const big = await request('/api/admin/newsletters', { method: 'POST', cookie: admin, body: { subject: '큼', html: '가'.repeat(70000) } });
  assert.equal(big.status, 400, 'the cap counts UTF-8 bytes (70,000 Korean chars ≈ 210KB)');
  assert.match(big.data.error, /180KB/);

  const test = await request('/api/admin/newsletters/test', { method: 'POST', cookie: admin, body: { subject: '3월 소식', html: '<p>미리보기</p>' } });
  assert.equal(test.status, 200);
  assert.equal(mock.sent.length, 1);
  assert.equal(mock.sent[0].to, 'active@ks.ac.kr', 'test mail goes only to the admin');
  assert.equal(mock.sent[0].subject, '[테스트] 3월 소식');
  assert.match(mock.sent[0].html, /\/account"/, 'test footer links to the account page');
  mock.sent = [];

  // Everyone active and subscribed at the first call; the fixture's second (off) and suspended members are not.
  const expected = query("SELECT email FROM users WHERE status='active' AND newsletter=1").map((row) => row.email);
  let result;
  do {
    result = await send(id);
    assert.equal(result.status, 200);
  } while (!result.data.done);
  const recipients = mock.sent.map((m) => m.to);
  assert.deepEqual([...recipients].sort(), [...expected].sort(), 'reaches exactly the subscribed active members');
  assert.equal(new Set(recipients).size, recipients.length, 'nobody twice');
  assert.ok(recipients.includes('expired@ks.ac.kr') && !recipients.includes('second@ks.ac.kr'));
  assert.ok(!recipients.includes('suspended@ks.ac.kr'));
  const mail = mock.sent.find((m) => m.to === 'expired@ks.ac.kr');
  const token = decodeURIComponent(mail.html.match(/\/newsletter\/unsubscribe\?token=([^"&]+)/)[1]);
  const [owner] = query("SELECT newsletter_token FROM users WHERE id='test-member-expired'");
  assert.equal(token, owner.newsletter_token, 'footer carries the recipient’s own token');
  assert.ok(mail.html.indexOf('뉴스레터 받지 않기') < mail.html.indexOf('</body>'), 'footer goes before </body>');
  const again = await send(id);
  assert.equal(again.data.sent, 0);
  assert.equal(mock.sent.length, recipients.length, 'a second call sends nothing more');
  const [started] = query(`SELECT sent_at,started_by,started_by_name,started_at FROM newsletters WHERE id='${id}'`);
  assert.ok(started.sent_at, 'marked sent');
  assert.equal(started.started_by, 'test-member-active', 'who started sending is recorded');
  assert.ok(started.started_at);
  const listed = (await request('/api/admin/newsletters', { cookie: admin })).data.newsletters.find((n) => n.id === id);
  assert.equal(listed.started_by_name, '활성회원');
  assert.ok(listed.started_at);

  // Quota: none left stops with everyone pending; one left mid-batch sends one and keeps the rest pending.
  const second = await create('4월 소식');
  mock.remaining = 0;
  result = await send(second);
  assert.equal(result.data.exhausted, true, 'quota 0 stops');
  assert.equal(result.data.sent, 0);
  assert.ok(result.data.pending >= 2);
  mock.remaining = 1;
  const before = result.data.pending;
  result = await send(second);
  assert.equal(result.data.sent, 1);
  assert.equal(result.data.failed, 0, "'quota' per message is not a failure");
  assert.equal(result.data.pending, before - 1);
  assert.equal(result.data.exhausted, true);
  mock.remaining = 100;

  await finish(second);

  // Unknown outcome (unreadable reply after the script mailed): failed, never resent.
  mock.mode = 'html';
  const unsure = await create('5월 소식');
  result = await send(unsure);
  assert.equal(result.status, 502);
  assert.match(result.data.error, /보낸편지함/);
  const unconfirmed = mailed('5월 소식');
  assert.ok(unconfirmed.length >= 1);
  const marked = deliveries(unsure).filter((d) => d.status === 'failed');
  assert.equal(marked.length, unconfirmed.length, 'the whole batch is marked failed');
  assert.ok(marked.every((d) => d.error === '발송 여부 확인 불가'));
  await finish(unsure);
  const all = mailed('5월 소식');
  assert.equal(new Set(all).size, all.length, 'nobody gets it twice after an unknown outcome');

  // Definite refusal: nothing was mailed, so the batch goes back to pending and is sent later.
  mock.mode = 'reject';
  const refused = await create('6월 소식');
  result = await send(refused);
  assert.equal(result.status, 502);
  assert.equal(mailed('6월 소식').length, 0);
  assert.ok(deliveries(refused).every((d) => d.status === 'pending'), 'refused rows are pending again');
  await finish(refused);
  assert.ok(deliveries(refused).every((d) => d.status === 'sent'));

  // The address is read when mailing: a change after the snapshot reaches the new address.
  execute("UPDATE users SET newsletter=1 WHERE id='test-member-second'");
  const moved = await create('7월 소식');
  mock.remaining = 0;
  await send(moved); // snapshot only
  mock.remaining = 100;
  execute("UPDATE users SET email='second-new@ks.ac.kr' WHERE id='test-member-second'");
  await finish(moved);
  assert.ok(mailed('7월 소식').includes('second-new@ks.ac.kr') && !mailed('7월 소식').includes('second@ks.ac.kr'));

  // An admin-approved unverified sign-up (pending rows start with newsletter=0) is not subscribed.
  const now = Date.now();
  execute(
    `INSERT INTO users (id,email,display_name,status,newsletter,created_at,updated_at) VALUES ('test-newsletter-pending','nl-pending@ks.ac.kr','대기','pending',0,${now},${now})`,
  );
  assert.equal(
    (await request('/api/admin/users/test-newsletter-pending', { method: 'PATCH', cookie: admin, body: { status: 'active' } }))
      .status,
    200,
  );
  assert.equal(query("SELECT newsletter FROM users WHERE id='test-newsletter-pending'")[0].newsletter, 0, 'approval keeps it off');
  const approved = await create('8월 소식');
  await finish(approved);
  assert.ok(!mailed('8월 소식').includes('nl-pending@ks.ac.kr'));

  // Withdrawal removes the member's delivery rows (and with them the last trace of the address).
  assert.ok(query("SELECT 1 FROM newsletter_deliveries WHERE user_id='test-member-second'").length);
  const left = await request('/api/account', { method: 'DELETE', cookie: fixture.secondCookie, body: { confirm: '회원탈퇴' } });
  assert.equal(left.status, 200);
  assert.equal(query("SELECT 1 FROM newsletter_deliveries WHERE user_id='test-member-second'").length, 0);

  // Unsubscribe by token; unknown tokens get the same answer.
  assert.deepEqual((await request('/api/newsletter/unsubscribe', { method: 'POST', body: { token: 'nope' } })).data, { ok: true });
  assert.equal((await request('/api/newsletter/unsubscribe', { method: 'POST', body: { token } })).status, 200);
  assert.equal(query("SELECT newsletter FROM users WHERE id='test-member-expired'")[0].newsletter, 0, 'token turns it off');

  // Delete only before anything is sent.
  assert.equal((await request(`/api/admin/newsletters/${id}`, { method: 'DELETE', cookie: admin, body: {} })).status, 409);
  assert.equal((await request(`/api/admin/newsletters/${second}`, { method: 'DELETE', cookie: admin, body: {} })).status, 409);
  const draft = await create('초안');
  assert.equal((await request(`/api/admin/newsletters/${draft}`, { method: 'DELETE', cookie: admin, body: {} })).status, 200);
  assert.equal(query(`SELECT id FROM newsletters WHERE id='${draft}'`).length, 0);
  console.log('newsletter tests passed');
} finally {
  const ids = created.map((value) => `'${value}'`).join(',') || "''";
  execute(
    `DELETE FROM newsletter_deliveries WHERE newsletter_id IN (${ids}); DELETE FROM newsletters WHERE id IN (${ids}); DELETE FROM member_audit WHERE target_id='test-newsletter-pending'; DELETE FROM users WHERE id='test-newsletter-pending';`,
  );
  fixture.cleanup();
  server.close();
}
