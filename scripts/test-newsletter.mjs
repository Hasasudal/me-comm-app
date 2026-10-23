// Newsletter API test. Needs the dev server (npm run dev) and these lines in .dev.vars, so the Worker talks to the
// mock Apps Script this script starts on 127.0.0.1:5199 (mirrors docs/newsletter/Code.gs):
//   NEWSLETTER_SCRIPT_URL=http://127.0.0.1:5199
//   NEWSLETTER_SCRIPT_SECRET=local-newsletter-secret
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createMemberFixture, execute, query, setRole } from './test-member-fixture.mjs';

const base = process.env.BASE_URL || 'http://localhost:5173';
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

async function request(path, { method = 'GET', body, cookie, origin = base } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json', Origin: origin } : {}),
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

  // Extra test recipients: registered active members only, at most 5.
  const testMail = (to) =>
    request('/api/admin/newsletters/test', { method: 'POST', cookie: admin, body: { subject: '추가 테스트', html: '<p>x</p>', to } });
  let t = await testMail('nobody@example.com, suspended@ks.ac.kr');
  assert.equal(t.status, 400);
  assert.ok(t.data.error.includes('nobody@example.com') && t.data.error.includes('suspended@ks.ac.kr'), 'unknown/inactive listed');
  assert.equal(mock.sent.length, 0, 'nothing is mailed when any address is unknown');
  t = await testMail('a@ks.ac.kr,b@ks.ac.kr,c@ks.ac.kr,d@ks.ac.kr,e@ks.ac.kr,f@ks.ac.kr');
  assert.equal(t.status, 400, 'more than 5 extras');
  t = await testMail(' Second@KS.ac.kr, active@ks.ac.kr ');
  assert.equal(t.status, 200);
  assert.deepEqual(mock.sent.map((m) => m.to).sort(), ['active@ks.ac.kr', 'second@ks.ac.kr'], 'admin once, plus the member');
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

  // Withdrawal (which also deletes the member's delivery rows) now needs a fresh Firebase ID token that can't be minted
  // locally, so only the refusal is checked here: without one nothing is deleted.
  assert.ok(query("SELECT 1 FROM newsletter_deliveries WHERE user_id='test-member-second'").length);
  const left = await request('/api/account', { method: 'DELETE', cookie: fixture.secondCookie, body: { confirm: '회원탈퇴' } });
  assert.equal(left.status, 403);
  assert.ok(query("SELECT 1 FROM newsletter_deliveries WHERE user_id='test-member-second'").length);

  // Unsubscribe by token; unknown tokens get the same answer.
  assert.deepEqual((await request('/api/newsletter/unsubscribe', { method: 'POST', body: { token: 'nope' } })).data, { ok: true });
  assert.equal((await request('/api/newsletter/unsubscribe', { method: 'POST', body: { token } })).status, 200);
  assert.equal(query("SELECT newsletter FROM users WHERE id='test-member-expired'")[0].newsletter, 0, 'token turns it off');

  // Scheduling: admins only, same origin, 5 minutes to 60 days ahead, and only before sending starts.
  const schedule = (nid, at, options = {}) =>
    request(`/api/admin/newsletters/${nid}/schedule`, { method: 'POST', cookie: admin, body: { at }, ...options });
  const unschedule = (nid) => request(`/api/admin/newsletters/${nid}/schedule`, { method: 'DELETE', cookie: admin, body: {} });
  const row = (nid) => query(`SELECT * FROM newsletters WHERE id='${nid}'`)[0];
  const hour = Date.now() + 3600000;
  const later = await create('예약 소식');
  assert.equal((await schedule(later, hour, { cookie: fixture.secondCookie })).status, 403, 'members cannot schedule');
  assert.equal((await schedule(later, hour, { origin: 'https://evil.example' })).status, 403, 'cross-origin is refused');
  for (const at of [Date.now() + 60000, Date.now() + 61 * 86400000, String(hour), null]) {
    const r = await schedule(later, at);
    assert.equal(r.status, 400, `bad time ${at}`);
    assert.equal(r.data.error, '예약 시각을 확인해주세요.');
  }
  assert.equal((await schedule(later, hour)).status, 200);
  let stored2 = row(later);
  assert.equal(stored2.scheduled_at, hour);
  assert.equal(stored2.scheduled_by, 'test-member-active');
  assert.equal(stored2.site_origin, base, 'the scheduling request’s origin is kept for the footer');
  const item = (await request('/api/admin/newsletters', { cookie: admin })).data.newsletters.find((n) => n.id === later);
  assert.equal(item.scheduled_at, hour);
  assert.equal(item.scheduled_by_name, '활성회원');
  assert.equal((await unschedule(later)).status, 200, 'cancel');
  assert.equal(row(later).scheduled_at, null);
  assert.equal((await schedule(id, hour)).status, 409, 'a sent newsletter cannot be scheduled');
  assert.equal((await unschedule(id)).status, 409);
  assert.equal((await schedule('missing', hour)).status, 404);

  // Sending by hand turns a scheduled newsletter into a manual send.
  const manual = await create('수동 전환');
  assert.equal((await schedule(manual, hour)).status, 200);
  assert.equal((await send(manual)).status, 200);
  assert.equal(row(manual).scheduled_at, null, 'manual send clears the schedule');
  assert.equal((await unschedule(manual)).status, 409, 'and it can no longer be cancelled');
  await finish(manual);

  // Cron (GET /cdn-cgi/handler/scheduled runs the Worker's scheduled handler; its waitUntil may outlive the reply).
  const until = async (check, what) => {
    for (let i = 0; i < 60; i++) {
      if (check()) return;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    assert.fail(`timed out: ${what}`);
  };
  const cron = async () => assert.equal((await fetch(`${base}/cdn-cgi/handler/scheduled?cron=*/10+*+*+*+*`)).status, 200);
  const due = await create('크론 소식');
  assert.equal((await schedule(due, hour)).status, 200);
  assert.equal((await schedule(later, hour)).status, 200, 'rescheduling works');
  execute(`UPDATE newsletters SET scheduled_at=${Date.now() - 1000},site_origin='https://lounge.example' WHERE id='${due}'`);
  const audience = query("SELECT COUNT(*) AS count FROM users WHERE status='active' AND newsletter=1")[0].count;
  assert.ok(audience >= 2);
  mock.remaining = 1;
  await cron();
  await until(() => mailed('크론 소식').length === 1 && mock.remaining === 0, 'first cron run');
  await new Promise((resolve) => setTimeout(resolve, 1500));
  stored2 = row(due);
  assert.equal(mailed('크론 소식').length, 1, 'quota stops the run');
  assert.equal(stored2.sent_at, null);
  assert.equal(stored2.started_by, 'test-member-active', 'the scheduler is recorded as the sender');
  assert.ok(stored2.scheduled_at, 'the schedule stays so later runs continue');
  assert.equal(deliveries(due).filter((d) => d.status === 'pending').length, audience - 1);
  mock.remaining = 100;
  await cron();
  await until(() => row(due).sent_at, 'second cron run');
  const cronMail = mock.sent.filter((m) => m.subject === '크론 소식');
  assert.equal(cronMail.length, audience);
  assert.equal(new Set(cronMail.map((m) => m.to)).size, audience, 'nobody twice');
  assert.ok(cronMail.every((m) => m.html.includes('href="https://lounge.example/newsletter/unsubscribe?token=')), 'footer uses site_origin');
  assert.ok(deliveries(due).every((d) => d.status === 'sent'));
  assert.equal(deliveries(later).length, 0, 'not-yet-due newsletters are left alone');
  assert.equal(mailed('예약 소식').length, 0);
  assert.equal((await request(`/api/admin/newsletters/${later}`, { method: 'DELETE', cookie: admin, body: {} })).status, 200, 'a scheduled draft can be deleted');

  // Audience 'staff': only subscribed active academic/council/admin members, snapshotted from the newsletter row.
  assert.equal((await request('/api/admin/newsletters', { method: 'POST', cookie: admin, body: { subject: 'x', html: 'x', audience: 'all2' } })).status, 400);
  execute("UPDATE users SET role='council',newsletter=1 WHERE id='test-member-expired'");
  const counts = (await request('/api/admin/newsletters', { cookie: admin })).data.audiences;
  const staffRows = query("SELECT email FROM users WHERE status='active' AND newsletter=1 AND role IN ('academic','council','admin')");
  assert.equal(counts.staff, staffRows.length);
  assert.ok(counts.all > counts.staff, 'staff is a subset');
  const staffId = await request('/api/admin/newsletters', { method: 'POST', cookie: admin, body: { subject: '운영진 소식', html: '<p>x</p>', audience: 'staff' } });
  created.push(staffId.data.id);
  assert.equal(row(staffId.data.id).audience, 'staff');
  await finish(staffId.data.id);
  assert.deepEqual(mailed('운영진 소식').sort(), staffRows.map((u) => u.email).sort(), 'only staff are mailed');
  assert.ok(mailed('운영진 소식').includes('expired@ks.ac.kr'));
  execute("UPDATE users SET role='member' WHERE id='test-member-expired'");

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
