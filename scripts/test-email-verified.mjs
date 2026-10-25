import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { execute, query, setRole } from './test-member-fixture.mjs';

// 1. The sign-in upsert in lib/member-auth.ts, run for real on an in-memory SQLite (D1 is SQLite).
const source = readFileSync('lib/member-auth.ts', 'utf8');
const upsert = source.match(/"(INSERT INTO users \(id,email,display_name,status,suspended_at,email_verified_at[^"]+)"/)?.[1];
assert.ok(upsert, 'upsert SQL found');
const mem = new DatabaseSync(':memory:');
mem.exec(
  "CREATE TABLE users (id text PRIMARY KEY, email text NOT NULL, display_name text NOT NULL, status text NOT NULL DEFAULT 'active', suspended_at integer, email_verified_at integer, newsletter integer NOT NULL DEFAULT 1, created_at integer NOT NULL, updated_at integer NOT NULL)",
);
const signIn = (id, email, verified, now) => mem.prepare(upsert).run(id, email, 'n', verified ? now : null, now, now);
const verifiedAt = (id) => mem.prepare('SELECT email_verified_at v FROM users WHERE id=?').get(id).v;
signIn('a', 'a@ks.ac.kr', true, 100);
assert.equal(verifiedAt('a'), 100, 'new verified user is stamped');
signIn('a', 'a@ks.ac.kr', true, 200);
assert.equal(verifiedAt('a'), 100, 'same address keeps the first verification time');
signIn('a', 'a2@ks.ac.kr', true, 300);
assert.equal(verifiedAt('a'), 300, 'a verified address change restarts it');
mem.exec("INSERT INTO users (id,email,display_name,status,email_verified_at,created_at,updated_at) VALUES ('b','b@ks.ac.kr','n','active',NULL,1,1), ('p','p@ks.ac.kr','n','pending',NULL,1,1)");
signIn('b', 'b@ks.ac.kr', false, 400);
assert.equal(verifiedAt('b'), null, 'unverified sign-in of an approved member never stamps');
signIn('b', 'b@ks.ac.kr', true, 500);
assert.equal(verifiedAt('b'), 500, 'verifying later stamps an approved member');
signIn('p', 'p@ks.ac.kr', true, 600);
assert.equal(verifiedAt('p'), 600, 'verifying a pending sign-up stamps it');

// 2. /api/session and /api/admin/users against the dev server (users and sessions seeded directly).
const base = 'http://localhost:5173';
const run = Date.now().toString(36);
const ids = { admin: `ev-admin-${run}`, ok: `ev-ok-${run}`, bad: `ev-bad-${run}` };
const tokens = Object.fromEntries(Object.values(ids).map((id) => [id, `${id}-${crypto.randomUUID()}`]));
const sha = async (v) => Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v))).toString('hex');
const now = Date.now();
let sql = '';
for (const id of Object.values(ids))
  sql += `INSERT INTO users (id,email,display_name,status,email_verified_at,created_at,updated_at) VALUES ('${id}','${id}@ks.ac.kr','${id}','active',${id === ids.bad ? 'NULL' : now},${now},${now}); INSERT INTO sessions (token_hash,user_id,created_at,expires_at) VALUES ('${await sha(tokens[id])}','${id}',${now},${now + 900_000});`;
execute(sql);
setRole(ids.admin, 'admin');
const get = async (path, id) => {
  const res = await fetch(base + path, { headers: { Cookie: `micom_session=${tokens[id]}` } });
  return { status: res.status, data: await res.json() };
};
try {
  assert.equal((await get('/api/session', ids.bad)).data.emailVerified, false, 'NULL email_verified_at -> false');
  assert.equal((await get('/api/session', ids.ok)).data.emailVerified, true, 'set email_verified_at -> true');
  const list = await get(`/api/admin/users?q=ev-&limit=50`, ids.admin);
  assert.equal(list.status, 200);
  const flag = (id) => list.data.users.find((u) => u.id === id)?.email_verified;
  assert.equal(flag(ids.bad), false);
  assert.equal(flag(ids.ok), true);
  const only = (await get('/api/admin/users?status=unverified&q=ev-&limit=50', ids.admin)).data.users.map((u) => u.id);
  assert.ok(only.includes(ids.bad) && !only.includes(ids.ok), 'unverified filter');
  assert.equal((await get('/api/admin/users', ids.ok)).status, 403, 'non-admin cannot list members');
  // Approving never stamps: an approved pending sign-up stays unverified.
  execute(`UPDATE users SET status='pending',email_verified_at=NULL WHERE id='${ids.bad}'`);
  const approved = await fetch(base + '/api/admin/users/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base, Cookie: `micom_session=${tokens[ids.admin]}` },
    body: JSON.stringify({ userIds: [ids.bad] }),
  });
  assert.equal(approved.status, 200);
  const row = query(`SELECT status,email_verified_at v FROM users WHERE id='${ids.bad}'`)[0];
  assert.deepEqual([row.status, row.v], ['active', null], 'approval leaves email unverified');
  console.log('email verified tests passed');
} finally {
  const list = Object.values(ids).map((id) => `'${id}'`).join(',');
  execute(`DELETE FROM member_audit WHERE target_id IN (${list}); DELETE FROM sessions WHERE user_id IN (${list}); DELETE FROM users WHERE id IN (${list})`);
}
