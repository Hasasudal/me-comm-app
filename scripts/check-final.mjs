import assert from 'node:assert/strict';
const base='http://localhost:5173';
assert.equal((await fetch(base)).status,200);
const session=await (await fetch(base+'/api/session')).json();
assert.equal(session.configured,false,'administrator remains unconfigured');
assert.equal(session.admin,false);
assert.equal((await fetch(base+'/api/admin/posts')).status,403);
let posts=await (await fetch(base+'/api/posts')).json();
const test=posts.posts.find(p=>p.title==='화면 검증용 동아리 글');
if(test){
 const read=await fetch(`${base}/api/posts/${test.id}`,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({password:'Ui-test-only-123'})});
 assert.equal((await read.json()).post.content,'비밀번호를 확인한 뒤 보여야 하는 테스트 본문입니다.','saved data survived server restart');
 const removed=await fetch(`${base}/api/posts/${test.id}`,{method:'DELETE',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({password:'Ui-test-only-123'})});assert.equal(removed.status,200);
}
posts=await (await fetch(base+'/api/posts')).json();
assert.equal(posts.posts.some(p=>p.title==='화면 검증용 동아리 글'),false);
console.log('PASS: page renders, administrator unconfigured and denied, browser test data removed.');
