import { execFileSync } from 'node:child_process';

const wrangler = './node_modules/wrangler/bin/wrangler.js';
const config = 'dist/server/wrangler.json';

function quote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function execute(sql, json = false) {
  return execFileSync(
    process.execPath,
    [
      '--import',
      './scripts/sites-env.mjs',
      wrangler,
      'd1',
      'execute',
      'DB',
      '--local',
      '--config',
      config,
      '--persist-to',
      '.wrangler/state',
      '--command',
      sql,
      ...(json ? ['--json'] : []),
    ],
    { cwd: process.cwd(), stdio: json ? ['ignore', 'pipe', 'ignore'] : 'ignore', encoding: 'utf8' },
  );
}
// Roles are assigned by admins in the app; tests set them directly.
export function setRole(userId, role) {
  execute(`UPDATE users SET role=${quote(role)} WHERE id=${quote(userId)}`);
}
export function query(sql) {
  return JSON.parse(execute(sql, true))[0].results;
}

async function hash(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Buffer.from(digest).toString('hex');
}

export async function createMemberFixture() {
  const now = Date.now();
  const members = [
    {
      id: 'test-member-active',
      email: 'active@ks.ac.kr',
      name: '활성회원',
      status: 'active',
      token: `active-${crypto.randomUUID()}`,
      expires: now + 60_000,
    },
    {
      id: 'test-member-second',
      email: 'second@ks.ac.kr',
      name: '두번째회원',
      status: 'active',
      token: `second-${crypto.randomUUID()}`,
      expires: now + 60_000,
    },
    {
      id: 'test-member-expired',
      email: 'expired@ks.ac.kr',
      name: '만료회원',
      status: 'active',
      token: `expired-${crypto.randomUUID()}`,
      expires: now - 1_000,
    },
    {
      id: 'test-member-suspended',
      email: 'suspended@ks.ac.kr',
      name: '정지회원',
      status: 'suspended',
      token: `suspended-${crypto.randomUUID()}`,
      expires: now + 60_000,
    },
  ];
  const ids = members.map((member) => quote(member.id)).join(',');
  execute(`DELETE FROM sessions WHERE user_id IN (${ids}); DELETE FROM users WHERE id IN (${ids});`);
  for (const member of members) {
    execute(
      `INSERT INTO users (id,email,display_name,status,suspended_at,created_at,updated_at) VALUES (${quote(member.id)},${quote(member.email)},${quote(member.name)},${quote(member.status)},${member.status === 'suspended' ? now : 'NULL'},${now},${now}); INSERT INTO sessions (token_hash,user_id,created_at,expires_at) VALUES (${quote(await hash(member.token))},${quote(member.id)},${now},${member.expires});`,
    );
  }
  return {
    activeCookie: `micom_session=${members[0].token}`,
    secondCookie: `micom_session=${members[1].token}`,
    expiredCookie: `micom_session=${members[2].token}`,
    suspendedCookie: `micom_session=${members[3].token}`,
    cleanup() {
      execute(`DELETE FROM sessions WHERE user_id IN (${ids}); DELETE FROM users WHERE id IN (${ids});`);
    },
  };
}
