import assert from 'node:assert/strict';

const base = 'http://localhost:5173';

async function request(path, cookie) {
  const response = await fetch(base + path, {
    headers: cookie ? { Cookie: cookie } : {},
  });
  const raw = await response.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {}
  return { status: response.status, data };
}

const anonymous = await request('/api/posts');
assert.equal(anonymous.status, 401, 'a visitor cannot list community posts');

const forged = await request('/api/posts', 'micom_session=forged-session-token');
assert.equal(forged.status, 401, 'an unknown session cannot list community posts');

console.log('PASS: anonymous and forged sessions are denied community access.');
