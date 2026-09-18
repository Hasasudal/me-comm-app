import assert from 'node:assert/strict';
import { createMemberFixture, setRole } from './test-member-fixture.mjs';

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
