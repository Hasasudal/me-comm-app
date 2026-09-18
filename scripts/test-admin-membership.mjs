import assert from 'node:assert/strict';
import { createMemberFixture, execute, setRole } from './test-member-fixture.mjs';

const base = 'http://localhost:5173';
const fixture = await createMemberFixture();
const admin = fixture.activeCookie,
  other = fixture.secondCookie;
async function request(path, { method = 'GET', body, cookie = admin } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json', Origin: base } : {}), Cookie: cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}
const assign = (userId, role, cookie = admin) =>
  request(`/api/admin/users/${userId}`, { method: 'PATCH', cookie, body: { role } });

try {
  assert.equal((await request('/api/session', { cookie: other })).data.role, 'member', 'new members start as 일반');
  assert.equal((await assign('test-member-second', 'admin', other)).status, 403, 'members cannot assign roles');

  setRole('test-member-active', 'admin');
  // Other admins may already exist locally; make the fixture admin the only one for the last-admin check.
  const users = await request('/api/admin/users?q=ks.ac.kr&limit=50');
  assert.equal(users.status, 200);
  assert.equal(users.data.users.find((u) => u.id === 'test-member-active').role, 'admin', 'lists show roles');

  for (const role of ['academic', 'council', 'member']) {
    assert.equal((await assign('test-member-second', role)).status, 200, `admins assign ${role}`);
    assert.equal((await request('/api/session', { cookie: other })).data.role, role, 'the role applies at once');
  }
  await assign('test-member-second', 'academic');
  const staff = (await request('/api/admin/users?role=academic&limit=50')).data.users;
  assert.ok(staff.length && staff.every((u) => u.role === 'academic'), 'the role filter lists only that role');
  assert.ok(staff.some((u) => u.id === 'test-member-second'));
  await assign('test-member-second', 'member');
  // Each change leaves a record naming who changed what; members cannot read the log.
  const log = (await request('/api/admin/audit')).data.entries.filter((e) => e.target_email === 'second@ks.ac.kr');
  assert.deepEqual(
    log.slice(0, 2).map((e) => [e.action, e.before, e.after, e.actor_name]),
    [
      ['role', 'academic', 'member', '활성회원'],
      ['role', 'member', 'academic', '활성회원'],
    ],
    'role changes are recorded newest first',
  );
  assert.equal((await request('/api/admin/audit', { cookie: other })).status, 403, 'members cannot read the log');
  // Accounts whose verification mail never arrived wait for an admin to approve or decline them.
  const now = Date.now();
  execute(
    `INSERT INTO users (id,email,display_name,status,role,created_at,updated_at) VALUES ('test-pending-1','pending1@ks.ac.kr','대기일','pending','member',${now},${now}),('test-pending-2','pending2@ks.ac.kr','대기이','pending','member',${now},${now})`,
  );
  try {
    const session = (await request('/api/session')).data;
    assert.ok(session.pendingMembers >= 2, 'admins see how many members wait for approval');
    assert.equal((await request('/api/session', { cookie: other })).data.pendingMembers, 0, 'members do not');
    const bell = (await request('/api/notifications')).data.replies;
    assert.ok(
      bell.some((r) => r.kind === 'signup' && r.excerpt === 'pending1@ks.ac.kr'),
      'the admin bell lists approval requests',
    );
    const waitingList = (await request('/api/admin/users?status=pending&limit=50')).data.users.map((u) => u.id);
    assert.ok(waitingList.includes('test-pending-1') && waitingList.includes('test-pending-2'));
    assert.equal(
      (await request('/api/admin/users/test-pending-1', { method: 'PATCH', body: { status: 'active' } })).status,
      200,
      'admins approve',
    );
    assert.equal(
      (await request('/api/admin/users/test-pending-2', { method: 'PATCH', body: { status: 'suspended' } })).status,
      200,
      'admins decline',
    );
    const after = (await request('/api/admin/users?q=pending&limit=50')).data.users;
    assert.deepEqual(
      after
        .filter((u) => u.id.startsWith('test-pending-'))
        .map((u) => [u.id, u.status])
        .sort(),
      [
        ['test-pending-1', 'active'],
        ['test-pending-2', 'suspended'],
      ],
    );
    const logged = (await request('/api/admin/audit')).data.entries.find((e) => e.target_email === 'pending1@ks.ac.kr');
    assert.deepEqual(
      [logged.action, logged.before, logged.after],
      ['status', 'pending', 'active'],
      'approval is logged',
    );
  } finally {
    execute(
      "DELETE FROM member_audit WHERE target_id LIKE 'test-pending-%'; DELETE FROM users WHERE id LIKE 'test-pending-%'",
    );
  }
  assert.equal((await assign('test-member-second', 'owner')).status, 400, 'unknown roles are rejected');
  assert.equal((await assign('test-member-active', 'member')).status, 400, 'admins cannot demote themselves');

  assert.equal((await assign('test-member-second', 'admin')).status, 200, 'admins appoint admins');
  assert.equal((await request('/api/session', { cookie: other })).data.admin, true);
  assert.equal(
    (await assign('test-member-active', 'member', other)).status,
    200,
    'a second admin can demote the first',
  );
  assert.equal((await request('/api/admin/users', { cookie: admin })).status, 403, 'demoted admins lose access');
  const lastAdmins = await request('/api/admin/users?q=ks.ac.kr&limit=50', { cookie: other });
  if (lastAdmins.data.users.filter((u) => u.role === 'admin').length === 1 && lastAdmins.data.total <= 50)
    assert.equal(
      (
        await request('/api/admin/users/test-member-second', {
          method: 'PATCH',
          cookie: other,
          body: { status: 'suspended' },
        })
      ).status,
      400,
      'admins cannot suspend themselves',
    );
} finally {
  fixture.cleanup();
}
console.log(
  'PASS: roles start as 일반, only admins assign 학사·학생회·관리자, self-demotion is blocked and new admins take over.',
);
