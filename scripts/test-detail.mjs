import assert from 'node:assert/strict';

const base='http://localhost:5173';
const password='Test-only-1234';

async function request(path,{method='GET',body}={}){
 const res=await fetch(base+path,{method,headers:body?{'Content-Type':'application/json',Origin:base}:{},body:body?JSON.stringify(body):undefined});
 const raw=await res.text();const data=raw?JSON.parse(raw):{};return {status:res.status,data};
}

const suffix=Date.now();
const board=await request('/api/posts',{method:'POST',body:{title:`상세 검증 ${suffix}`,content:'보호된 본문',category:'board',password}});
assert.equal(board.status,201);
const contest=await request('/api/posts',{method:'POST',body:{title:`모집 검증 ${suffix}`,content:'함께 만들어요',category:'contests',password,recruitment_status:'open',deadline:'2026-12-31',headcount:3,roles:'기획, 디자인'}});
assert.equal(contest.status,201);

try{
 const metadata=await request(`/api/posts/${board.data.id}`);
 assert.equal(metadata.status,200,'published detail metadata has a public endpoint');
 assert.equal(metadata.data.post.title,`상세 검증 ${suffix}`);
 assert.equal('content' in metadata.data.post,false,'metadata never exposes protected content');

 let unlocked=await request(`/api/posts/${contest.data.id}`,{method:'POST',body:{password}});
 assert.equal(unlocked.data.post.recruitment_status,'open');
 assert.equal(unlocked.data.post.deadline,'2026-12-31');
 assert.equal(unlocked.data.post.headcount,3);
 assert.equal(unlocked.data.post.roles,'기획, 디자인');

 const edited=await request(`/api/posts/${contest.data.id}`,{method:'PATCH',body:{title:'모집 수정',content:'수정한 모집',password,recruitment_status:'closed',deadline:'2027-01-15',headcount:4,roles:'영상, 개발'}});
 assert.equal(edited.status,200);
 unlocked=await request(`/api/posts/${contest.data.id}`,{method:'POST',body:{password}});
 assert.equal(unlocked.data.post.recruitment_status,'closed');
 assert.equal(unlocked.data.post.headcount,4);
 assert.equal(unlocked.data.post.roles,'영상, 개발');
} finally {
 await request(`/api/posts/${board.data.id}`,{method:'DELETE',body:{password}});
 await request(`/api/posts/${contest.data.id}`,{method:'DELETE',body:{password}});
}

console.log('PASS: protected detail metadata and structured recruitment fields.');
