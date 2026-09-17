# 미컴 라운지

경성대학교 학교 이메일 회원을 위한 학과 커뮤니티 웹입니다.

## 구현 기능

- 누구나 첫 화면 접근 가능
- `@ks.ac.kr` 이메일·비밀번호 가입, 이메일 인증, 로그인과 비밀번호 재설정
- 인증 회원만 게시글 목록·상세·작성·수정·삭제 이용
- 통합 게시판, 자유게시판, 학과 뉴스, 동아리, 공모전 모집의 개별 주소
- 로그인 회원의 본문 열람, 작성자 이름·머릿글, 게시글 비밀번호를 이용한 수정·삭제 확인
- 작성자 본인만 보는 학과 뉴스와 승인 대기·피드백·반려·승인 상태 확인
- 관리자 뉴스 승인·반려와 형광펜·굵게·메모 피드백
- 관리자 초대 코드 등록, 관리자 목록과 회원 검색·정지·복구
- 이름·학교 이메일 변경과 회원 탈퇴

Firebase는 계정 비밀번호와 이메일 인증을 담당합니다. D1에는 회원 프로필과 해시된 14일 세션만 저장하며 Firebase 비밀번호와 세션 원문은 저장하지 않습니다.

## 로컬 실행

Node.js 22.13 이상이 필요합니다.

```sh
npm run install:ci
npm run build
npm run dev
```

새 로컬 데이터베이스에는 `npm run db:migrate:local`로 `drizzle/0000`~`0004`를 적용합니다. `.dev.vars.example`을 복사해 `.dev.vars`를 만들고 관리자 코드 해시·salt와 Firebase 공개 설정 네 값을 입력합니다.

## Firebase 웹 앱 설정

1. Firebase Console의 프로젝트 개요에서 **앱 추가 → 웹(`</>`)**을 선택합니다.
2. 앱 이름을 입력하고 Firebase Hosting은 선택하지 않은 채 앱을 등록합니다.
3. 표시되는 `firebaseConfig`에서 `apiKey`, `authDomain`, `projectId`, `appId`를 복사합니다.
4. **Authentication → Sign-in method**에서 이메일/비밀번호를 활성화합니다.
5. **Authentication → Settings → Authorized domains**에 운영 사이트 도메인을 추가합니다.
6. **Authentication → Templates**의 이메일 인증·비밀번호 재설정·이메일 변경 템플릿에서 작업 URL을 운영 사이트의 `/auth/action`으로 설정하고 한국어 문구를 작성합니다.

이 네 값은 공개 웹 앱 식별자이며 서비스 계정 비밀 키가 아닙니다. 그래도 소스에 직접 넣지 않고 다음 환경 변수로 관리합니다.

```text
FIREBASE_API_KEY=
FIREBASE_AUTH_DOMAIN=
FIREBASE_PROJECT_ID=
FIREBASE_APP_ID=
```

운영 배포 순서와 검증 항목은 `docs/implementation.md`, `docs/verification.md`에 있습니다.

## 자동 검증

개발 서버가 `http://localhost:5173`에서 실행 중일 때 다음 검사를 실행합니다.

```sh
node --experimental-strip-types scripts/test-firebase-token.mjs
node scripts/test-member-access.mjs
node scripts/test-account-admin.mjs
node scripts/test-admin-membership.mjs
node scripts/test-api.mjs
node scripts/test-detail.mjs
node scripts/test-pages.mjs
npm run lint
npx tsc --noEmit
npm run build
```
