import assert from 'node:assert/strict';

const base='http://localhost:5173';

const detail=await fetch(base+'/posts/example-id');
const detailHtml=await detail.text();
assert.equal(detail.status,200,'detail URL renders a dedicated page');
assert.match(detailHtml,/게시글 상세/);

const boardHtml=await (await fetch(base+'/')).text();
assert.match(boardHtml,/aria-label="제목 검색"/,'board exposes title search');

const join=await fetch(base+'/admin/join');
const joinHtml=await join.text();
assert.equal(join.status,200,'admin code registration has a dedicated page');
assert.match(joinHtml,/관리자 코드 등록/);

console.log('PASS: detail URL, title search and admin registration UI are rendered.');
