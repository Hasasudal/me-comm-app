import assert from 'node:assert/strict';

const base='http://localhost:5173';
const page=await fetch(base);const html=await page.text();
assert.equal(page.status,200);
assert.match(html,/계정 정보를 확인하고 있습니다/);
assert.doesNotMatch(html,/학교 이메일 인증 후 이용할 수 있어요/);
const session=await (await fetch(base+'/api/session')).json();
assert.equal(session.signedIn,false);assert.equal(session.admin,false);
assert.equal((await fetch(base+'/api/posts')).status,401);
assert.equal((await fetch(base+'/api/admin/posts')).status,401);
console.log('PASS: public landing page renders while community and administration APIs require membership.');
