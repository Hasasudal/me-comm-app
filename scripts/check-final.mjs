import assert from 'node:assert/strict';

const base='http://localhost:5173';
const page=await fetch(base);const html=await page.text();
assert.equal(page.status,200);
assert.match(html,/로그인/);assert.match(html,/회원가입/);assert.match(html,/@ks\.ac\.kr/);
const session=await (await fetch(base+'/api/session')).json();
assert.equal(session.signedIn,false);assert.equal(session.admin,false);
assert.equal((await fetch(base+'/api/posts')).status,401);
assert.equal((await fetch(base+'/api/admin/posts')).status,401);
console.log('PASS: public landing page renders while community and administration APIs require membership.');
