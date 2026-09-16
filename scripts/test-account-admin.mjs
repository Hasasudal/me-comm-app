import assert from 'node:assert/strict';
import { createMemberFixture } from './test-member-fixture.mjs';

const base='http://localhost:5173';
async function request(path,{method='GET',body,cookie}={}){
 const response=await fetch(base+path,{method,headers:{...(body?{'Content-Type':'application/json',Origin:base}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});
 const raw=await response.text();let data={};try{data=raw?JSON.parse(raw):{};}catch{}return {status:response.status,data};
}

const fixture=await createMemberFixture();
assert.equal((await request('/api/account',{method:'PATCH',body:{idToken:'invalid'}})).status,401,'anonymous profile update is denied');
assert.equal((await request('/api/account',{method:'PATCH',cookie:fixture.activeCookie,body:{idToken:'x'.repeat(120)}})).status,401,'unverified Firebase identity is denied');
assert.equal((await request('/api/account',{method:'DELETE',cookie:fixture.activeCookie,body:{confirm:'잘못된 문구'}})).status,400,'account deletion requires the exact phrase');
assert.equal((await request('/api/account',{method:'DELETE',cookie:fixture.activeCookie,body:{confirm:'회원탈퇴'}})).status,200,'member can delete their account');
const session=await request('/api/session',{cookie:fixture.activeCookie});
assert.equal(session.data.signedIn,false,'deleted account session cannot be reused');
fixture.cleanup();

console.log('PASS: account API rejects anonymous or unverified changes and removes member sessions on deletion.');
