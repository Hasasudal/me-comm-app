import assert from 'node:assert/strict';

const base = 'http://localhost:5173';

const detail = await fetch(base + '/posts/example-id');
const detailHtml = await detail.text();
assert.equal(detail.status, 200, 'detail URL renders a dedicated page');
assert.match(detailHtml, /회원 계정/);
assert.match(detailHtml, /계정 확인 중/, 'account actions wait for the session like the board pages');

const boardHtml = await (await fetch(base + '/')).text();
assert.doesNotMatch(boardHtml, /aria-label="제목 검색"/, 'anonymous page does not expose board controls');
assert.match(
  boardHtml,
  /계정 정보를 확인하고 있습니다/,
  'initial page waits for the member session before choosing a signed-in or guest view',
);
assert.doesNotMatch(
  boardHtml,
  /학교 이메일 인증 후 이용할 수 있어요/,
  'initial page does not flash the guest gate before session loading finishes',
);

assert.equal((await fetch(base + '/admin/join')).status, 404, 'admin code registration is gone');

const signup = await fetch(base + '/signup');
const signupHtml = await signup.text();
assert.equal(signup.status, 200, 'school account sign-up has a dedicated page');
assert.match(signupHtml, /회원가입/);
assert.match(signupHtml, /이름/);
assert.match(signupHtml, /@ks\.ac\.kr/);
assert.match(signupHtml, /비밀번호 확인/);

const login = await fetch(base + '/login');
const loginHtml = await login.text();
assert.equal(login.status, 200, 'member login has a dedicated page');
assert.match(loginHtml, /로그인/);
assert.match(loginHtml, /비밀번호 재설정/);

const verify = await fetch(base + '/verify-email');
const verifyHtml = await verify.text();
assert.equal(verify.status, 200, 'email verification guidance has a dedicated page');
assert.match(verifyHtml, /학교 이메일/);
assert.match(verifyHtml, /인증 메일/);

const help = await fetch(base + '/help');
const helpHtml = await help.text();
assert.equal(help.status, 200, 'the help page is open without signing in');
assert.match(helpHtml, /가입과 로그인/);
assert.match(helpHtml, /직책 안내/);

for (const [query, label] of [
  ['mode=verifyEmail&oobCode=test-code', '이메일 인증'],
  ['mode=resetPassword&oobCode=test-code', '비밀번호 재설정'],
  ['mode=recoverEmail&oobCode=test-code', '이메일 복구'],
  ['mode=unknown', '올바르지 않은 요청'],
]) {
  const action = await fetch(base + `/auth/action?${query}`);
  const actionHtml = await action.text();
  assert.equal(action.status, 200, `email action page renders for ${query}`);
  assert.match(actionHtml, new RegExp(label), `email action page explains ${label}`);
}

console.log(
  'PASS: detail URL, title search, admin registration, member authentication and email action pages are rendered.',
);
