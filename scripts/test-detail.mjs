import assert from 'node:assert/strict';
import { createMemberFixture } from './test-member-fixture.mjs';

const base='http://localhost:5173';
const password='Test-only-1234';

const fixture=await createMemberFixture();
async function request(path,{method='GET',body,cookie=fixture.activeCookie}={}){
 const res=await fetch(base+path,{method,headers:{...(body?{'Content-Type':'application/json',Origin:base}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});
 const raw=await res.text();const data=raw?JSON.parse(raw):{};return {status:res.status,data};
}

const suffix=Date.now();
assert.equal((await request('/api/posts',{cookie:''})).status,401,'anonymous list is denied');
assert.equal((await request('/api/posts/example-id',{cookie:''})).status,401,'anonymous detail is denied');
const board=await request('/api/posts',{method:'POST',body:{title:`상세 검증 ${suffix}`,content:'회원 본문',category:'board',author_name:'상세작성자',prefix:'정보',password}});
assert.equal(board.status,201);
const contest=await request('/api/posts',{method:'POST',body:{title:`모집 검증 ${suffix}`,content:'함께 만들어요',category:'contests',author_name:'팀장',prefix:'광고공모전',password,recruitment_status:'open',deadline:'2026-12-31',headcount:3,roles:'기획, 디자인'}});
assert.equal(contest.status,201);

try{
 const detail=await request(`/api/posts/${board.data.id}`,{cookie:fixture.secondCookie});
 assert.equal(detail.status,200,'any member opens a published post');
 assert.equal(detail.data.post.content,'회원 본문','detail includes the body without a password');
 assert.equal(detail.data.post.author_name,'상세작성자');assert.equal(detail.data.post.prefix,'정보');

 let recruit=(await request(`/api/posts/${contest.data.id}`)).data.post;
 assert.equal(recruit.recruitment_status,'open');
 assert.equal(recruit.deadline,'2026-12-31');
 assert.equal(recruit.headcount,3);
 assert.equal(recruit.roles,'기획, 디자인');

 const edited=await request(`/api/posts/${contest.data.id}`,{method:'PATCH',body:{title:'모집 수정',content:'수정한 모집',author_name:'팀장',prefix:'광고공모전',password,recruitment_status:'closed',deadline:'2027-01-15',headcount:4,roles:'영상, 개발'}});
 assert.equal(edited.status,200);
 recruit=(await request(`/api/posts/${contest.data.id}`)).data.post;
 assert.equal(recruit.recruitment_status,'closed');
 assert.equal(recruit.headcount,4);
 assert.equal(recruit.roles,'영상, 개발');
} finally {
 await request(`/api/posts/${board.data.id}`,{method:'DELETE',body:{password}});
 await request(`/api/posts/${contest.data.id}`,{method:'DELETE',body:{password}});
 fixture.cleanup();
}

console.log('PASS: members open post bodies directly, with author, prefix and recruitment fields.');
