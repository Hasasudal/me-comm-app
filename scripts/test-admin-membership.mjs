import assert from 'node:assert/strict';

const base='http://localhost:5173';
const adminCode='Local-admin-code-1234';

async function request(path,{method='GET',body,cookie}={}){
 const res=await fetch(base+path,{method,headers:{...(body?{'Content-Type':'application/json',Origin:base}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});
 const raw=await res.text();let data={};try{data=raw?JSON.parse(raw):{};}catch{}return {status:res.status,data};
}

const login=await fetch(base+'/signin-with-chatgpt?return_to=/admin',{redirect:'manual'});
const cookie=login.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
assert.ok(cookie,'local mock sign-in is available');

assert.equal((await request('/api/admin/join',{method:'POST',body:{code:adminCode}})).status,401,'sign-in is required');
assert.equal((await request('/api/admin/join',{method:'POST',cookie,body:{code:'incorrect-admin-code'}})).status,403,'wrong code is rejected');
assert.equal((await request('/api/admin/join',{method:'POST',cookie,body:{code:adminCode}})).status,201,'valid code registers the signed-in account');

const session=await request('/api/session',{cookie});
assert.equal(session.status,200);assert.equal(session.data.admin,true);assert.equal(session.data.signedIn,true);

const members=await request('/api/admin/members',{cookie});
assert.equal(members.status,200);assert.equal(members.data.members.length,1);
assert.equal(members.data.members[0].email,'seedy@sites.test');
assert.equal('code' in members.data,false,'admin code is never returned');

assert.equal((await request(`/api/admin/members/${encodeURIComponent(members.data.members[0].user_id)}`,{method:'DELETE',cookie,body:{}})).status,400,'an admin cannot revoke their own account');

console.log('PASS: code registration, role persistence, member listing and self-revocation protection.');
