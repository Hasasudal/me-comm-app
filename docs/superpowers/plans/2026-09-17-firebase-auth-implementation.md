# Firebase 학교 계정 인증 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 누구나 사이트 첫 화면에는 접근할 수 있지만 Firebase에서 `@ks.ac.kr` 이메일 인증을 완료한 회원만 게시판과 관리 기능을 이용하도록 만든다.

**Architecture:** Firebase Authentication이 이메일·비밀번호, 인증 메일과 비밀번호 재설정을 담당한다. 서버는 Firebase ID 토큰을 RS256으로 검증한 뒤 해시된 D1 세션을 발급하고, 기존 게시판 API는 이 세션을 공통 권한 경계로 사용한다. D1은 회원 프로필, 이용 상태, 앱 세션과 관리자 권한을 관리한다.

**Tech Stack:** Vinext/Next.js 호환 App Router, React 19, TypeScript, Firebase Web SDK, Cloudflare Workers Web Crypto, D1/SQLite, Drizzle, Node 통합 테스트, Sites 배포

**Spec:** `docs/superpowers/specs/2026-09-17-firebase-auth-design.md`

## Global Constraints

- 허용 이메일은 소문자로 정규화했을 때 정확히 `@ks.ac.kr`로 끝나야 하며 하위 도메인은 허용하지 않는다.
- Firebase 이메일 인증이 완료되지 않은 계정에는 D1 세션을 발급하지 않는다.
- 비밀번호는 Firebase만 관리하며 D1, 로그, 소스 코드에 저장하지 않는다.
- 세션 원문은 32바이트 이상의 난수이며 D1에는 SHA-256 해시만 저장한다.
- 세션 쿠키는 `micom_session`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, 14일 만료를 사용한다.
- 기존 게시글 비밀번호 보호, 뉴스 재승인, 관리자 초대 코드 흐름을 유지한다.
- Firebase 설정과 인증 경계가 검증되기 전에는 Sites 접근 정책을 `public`으로 변경하지 않는다.
- 새 동작은 실패 테스트를 먼저 작성하고 예상 원인으로 실패하는 것을 확인한 후 구현한다.
- HTTP 통합 테스트 단계에서는 최신 마이그레이션이 적용된 로컬 D1과 `.dev.vars`를 사용해 개발 서버를 `http://localhost:5173`에서 실행한다.
- Firebase 운영 설정이 없어도 Task 1~10의 단위·로컬 통합 테스트는 완료할 수 있으며 실제 이메일 검증은 Task 11에서 수행한다.

---

## File Structure

### 새 파일

- `lib/firebase-token.ts`: Firebase ID 토큰 파싱, 공개 키 캐시와 RS256 검증
- `lib/member-auth.ts`: D1 회원·세션 조회, 발급, 폐기와 권한 함수
- `app/firebase-client.ts`: 런타임 Firebase 공개 설정 로드와 브라우저 SDK 초기화
- `app/auth/auth-frame.tsx`: 회원가입·로그인·이메일 작업 화면 공통 프레임
- `app/signup/page.tsx`, `app/signup/signup-form.tsx`: 학교 계정 가입
- `app/login/page.tsx`, `app/login/login-form.tsx`: 로그인, 인증 재발송, 비밀번호 재설정
- `app/verify-email/page.tsx`: 인증 메일 발송 안내
- `app/auth/action/page.tsx`, `app/auth/action/action-handler.tsx`: 한국어 Firebase 이메일 작업 처리
- `app/account/page.tsx`, `app/account/account-panel.tsx`: 이름·이메일 변경과 탈퇴
- `app/api/auth/config/route.ts`: 공개 Firebase 설정
- `app/api/auth/session/route.ts`: ID 토큰 교환과 로그아웃
- `app/api/account/route.ts`: 프로필 동기화와 앱 계정 정리
- `app/admin/members/page.tsx`, `app/admin/members/member-manager.tsx`: 회원 검색·정지·복구
- `app/api/admin/users/route.ts`, `app/api/admin/users/[userId]/route.ts`: 관리자 회원 관리 API
- `drizzle/0003_school_members.sql`, `drizzle/meta/0003_snapshot.json`: 회원·세션 스키마
- `scripts/test-firebase-token.mjs`: 서명과 클레임 검증 테스트
- `scripts/test-member-access.mjs`: D1 회원 세션과 게시판 접근 통합 테스트
- `scripts/test-account-admin.mjs`: 프로필·탈퇴·정지·복구 통합 테스트

### 수정 파일

- `package.json`, `package-lock.json`: Firebase Web SDK 추가
- `db/schema.ts`, `drizzle/meta/_journal.json`: `users`, `sessions` 모델과 마이그레이션 기록
- `lib/server.ts`: 공통 `requireMember`, 회원 기반 `identity`와 `requireAdmin` 노출
- `cloudflare-env.d.ts`, `.env.example`, `.dev.vars.example`: Firebase 공개 설정 타입과 예시
- `app/community.tsx`: 비회원 게이트, 회원 정보, 로그아웃과 계정 링크
- `app/posts/[id]/post-detail.tsx`: 상세 페이지 회원 게이트
- `app/admin/join/admin-join.tsx`, `app/api/admin/join/route.ts`: ChatGPT 인증을 회원 세션으로 교체
- `app/api/posts/route.ts`, `app/api/posts/[id]/route.ts`: 모든 게시판 동작에 회원 권한 적용
- `app/api/admin/posts/route.ts`, `app/api/admin/posts/[id]/route.ts`: 새 회원 기반 관리자 권한 사용
- `app/api/session/route.ts`: 회원·관리자 세션 응답
- `app/globals.css`: 인증, 계정, 회원 관리와 비회원 게이트 스타일
- `scripts/test-api.mjs`, `scripts/test-admin-membership.mjs`, `scripts/test-detail.mjs`, `scripts/test-pages.mjs`: D1 테스트 회원 세션 방식으로 전환
- `README.md`, `docs/implementation.md`, `docs/verification.md`: 운영 설정과 검증 문서 갱신

---

### Task 1: 회원·세션 데이터 모델

**Files:**
- Modify: `db/schema.ts`
- Create: `drizzle/0003_school_members.sql`
- Create: `drizzle/meta/0003_snapshot.json`
- Modify: `drizzle/meta/_journal.json`
- Create: `scripts/test-member-access.mjs`

- [ ] **Step 1: 비회원과 가짜 쿠키가 게시판 API에서 거부되어야 한다는 통합 테스트 작성**

  `scripts/test-member-access.mjs`에 쿠키 없는 `GET /api/posts`와 임의 `micom_session` 쿠키 요청이 `401`을 반환한다는 첫 검증을 작성한다.

- [ ] **Step 2: 현재 동작에서 테스트가 실패하는지 확인**

  Run: `node scripts/test-member-access.mjs`

  Expected: 현재 `GET /api/posts`가 `200`을 반환하여 실패한다.

- [ ] **Step 3: Drizzle 모델과 SQL 마이그레이션 작성**

  `users`에 `id`, `email`, `display_name`, `status`, `suspended_at`, `created_at`, `updated_at`을 추가하고 이메일 고유 인덱스와 상태 인덱스를 만든다. `sessions`에 `token_hash`, `user_id`, `created_at`, `expires_at`을 추가하고 사용자·만료 인덱스를 만든다. `status` 기본값은 `active`로 둔다.

- [ ] **Step 4: 마이그레이션 메타데이터 생성·검토**

  Run: `npm run db:generate`

  Expected: `0003_school_members` SQL과 스냅샷이 생성되고 기존 테이블을 삭제하거나 변경하지 않는다.

- [ ] **Step 5: 로컬 D1에 새 마이그레이션 적용**

  Run: `node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0003_school_members.sql`

  Expected: `users`, `sessions` 테이블이 생성된다.

- [ ] **Step 6: 스키마만으로는 접근 테스트가 계속 실패함을 확인**

  Run: `node scripts/test-member-access.mjs`

  Expected: 여전히 비회원 `GET /api/posts`가 `200`이므로 실패하며 다음 작업의 권한 구현 필요성이 확인된다.

- [ ] **Step 7: 데이터 모델 커밋**

  Run: `git add db/schema.ts drizzle scripts/test-member-access.mjs && git commit -m "Add school member and session schema"`

---

### Task 2: Firebase ID 토큰 검증기

**Files:**
- Create: `lib/firebase-token.ts`
- Create: `scripts/test-firebase-token.mjs`
- Modify: `cloudflare-env.d.ts`
- Modify: `.env.example`
- Modify: `.dev.vars.example`

- [ ] **Step 1: 정상·실패 클레임을 표현하는 토큰 테스트 작성**

  테스트용 RS256 키 쌍으로 토큰을 서명하고 정상 토큰, 잘못된 서명, 잘못된 `aud`, 잘못된 `iss`, 만료, `email_verified=false`, 비학교 이메일, 빈 이름을 각각 검증한다. 공개 키 공급 함수는 테스트에서 주입한다.

- [ ] **Step 2: 구현 파일이 없어 테스트가 실패하는지 확인**

  Run: `node --experimental-strip-types scripts/test-firebase-token.mjs`

  Expected: `lib/firebase-token.ts` 모듈을 찾지 못해 실패한다.

- [ ] **Step 3: 최소 토큰 검증기 구현**

  JWT 세 부분과 JSON을 안전하게 파싱하고, `alg`, `kid`, 서명, `aud`, `iss`, `sub`, `iat`, `exp`, `email_verified`, 이메일과 이름을 검증한다. 오류는 사용자 토큰이나 이메일을 포함하지 않는 단일 인증 오류로 반환한다.

- [ ] **Step 4: Google 공개 키 캐시 추가**

  `https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com`에서 JWK를 가져오고 `Cache-Control` 만료 시간까지만 메모리에 보관한다. 알 수 없는 `kid`에서는 한 번 강제 갱신한다.

- [ ] **Step 5: 토큰 테스트 통과 확인**

  Run: `node --experimental-strip-types scripts/test-firebase-token.mjs`

  Expected: 모든 서명·클레임 케이스가 통과한다.

- [ ] **Step 6: Firebase 설정 타입과 예시 추가**

  `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_APP_ID`를 환경 타입과 예시 파일에 추가한다. 실제 값은 커밋하지 않는다.

- [ ] **Step 7: 토큰 검증기 커밋**

  Run: `git add lib/firebase-token.ts scripts/test-firebase-token.mjs cloudflare-env.d.ts .env.example .dev.vars.example && git commit -m "Verify Firebase school account tokens"`

---

### Task 3: D1 회원 세션과 공통 권한 경계

**Files:**
- Create: `lib/member-auth.ts`
- Modify: `lib/server.ts`
- Create: `app/api/auth/session/route.ts`
- Modify: `app/api/session/route.ts`
- Modify: `app/api/posts/route.ts`
- Modify: `app/api/posts/[id]/route.ts`
- Modify: `scripts/test-member-access.mjs`

- [ ] **Step 1: 테스트용 D1 회원·세션 준비 도우미 추가**

  통합 테스트가 임의 세션 토큰의 SHA-256 해시와 테스트 회원을 로컬 D1에 직접 넣고 종료 시 삭제하도록 작성한다. 운영 코드에는 테스트 우회 경로를 추가하지 않는다.

- [ ] **Step 2: 회원 쿠키가 있으면 목록이 열리고 정지·만료 세션은 거부된다는 테스트 작성**

  비회원 `401`, 정상 회원 `200`, 만료 세션 `401`, 정지 회원 `403`, 로그아웃 후 재사용 `401`을 추가한다.

- [ ] **Step 3: 예상 실패 확인**

  Run: `node scripts/test-member-access.mjs`

  Expected: 정상 회원과 비회원의 응답이 구분되지 않아 실패한다.

- [ ] **Step 4: 회원 세션 유틸리티 구현**

  쿠키 파싱, 토큰 해시, 회원·세션 조인 조회, 만료 정리, `requireMember`, 14일 세션 발급, 현재 세션 폐기, 사용자 전체 세션 폐기를 구현한다. `lib/server.ts`는 기존 라우트용 공통 façade로 이 함수들을 재노출한다.

- [ ] **Step 5: 세션 교환·로그아웃 API 구현**

  `POST /api/auth/session`은 Firebase ID 토큰을 검증하고 `users`를 upsert한 뒤 기존 세션을 교체한다. 정지 계정에는 `403`을 반환한다. `DELETE`는 현재 D1 세션과 쿠키를 제거한다.

- [ ] **Step 6: 게시판 API 전체에 `requireMember` 적용**

  목록, 메타데이터, 본문 잠금 해제, 작성, 수정과 삭제 진입부에서 회원 권한을 확인한다. 권한 검사를 비밀번호 계산과 데이터 조회보다 먼저 실행한다.

- [ ] **Step 7: 세션 통합 테스트 통과 확인**

  Run: `node scripts/test-member-access.mjs`

  Expected: 정상·만료·정지·로그아웃 케이스가 모두 통과한다.

- [ ] **Step 8: 세션 권한 커밋**

  Run: `git add lib/member-auth.ts lib/server.ts app/api/auth app/api/session app/api/posts scripts/test-member-access.mjs && git commit -m "Require verified member sessions for community access"`

---

### Task 4: Firebase 브라우저 클라이언트와 가입·로그인 화면

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `app/firebase-client.ts`
- Create: `app/api/auth/config/route.ts`
- Create: `app/auth/auth-frame.tsx`
- Create: `app/signup/page.tsx`
- Create: `app/signup/signup-form.tsx`
- Create: `app/login/page.tsx`
- Create: `app/login/login-form.tsx`
- Create: `app/verify-email/page.tsx`
- Modify: `app/globals.css`
- Modify: `scripts/test-pages.mjs`

- [ ] **Step 1: 인증 화면 페이지 테스트 작성**

  `/signup`, `/login`, `/verify-email`이 `200`이며 이름, `@ks.ac.kr`, 비밀번호, 인증 안내와 접근 가능한 레이블을 포함하는지 검증한다.

- [ ] **Step 2: 페이지가 없어 테스트가 실패하는지 확인**

  Run: `node scripts/test-pages.mjs`

  Expected: 새 경로가 `404`이므로 실패한다.

- [ ] **Step 3: Firebase Web SDK 설치**

  Run: `npm install firebase`

  Expected: `package.json`과 lockfile에 Firebase가 고정된다.

- [ ] **Step 4: 공개 설정 API와 클라이언트 싱글턴 구현**

  서버는 네 Firebase 공개 값이 모두 있을 때만 설정을 반환한다. 클라이언트는 설정을 한 번 가져와 Firebase 앱과 Auth 인스턴스를 초기화하고 한국어 언어 코드를 설정한다.

- [ ] **Step 5: 가입 흐름 구현**

  이름 2~40자, 정확한 학교 도메인, 비밀번호 확인을 검증한 뒤 `createUserWithEmailAndPassword`, `updateProfile`, `sendEmailVerification`을 순서대로 실행한다. 실패하면 Firebase 오류 코드를 한국어로 매핑한다.

- [ ] **Step 6: 로그인·인증 재발송·재설정 구현**

  로그인 후 `emailVerified`를 확인하고, 인증 완료 계정의 최신 ID 토큰만 `/api/auth/session`으로 교환한다. 미인증 계정은 재발송 화면을 제공하고 비밀번호 재설정 결과는 계정 존재 여부와 무관하게 같은 문구를 보여준다.

- [ ] **Step 7: 인증 화면 스타일 추가**

  기존 브랜드, 색상, 간격과 모바일 규칙을 재사용하고 키보드 포커스, 오류 `role=alert`, 진행 상태와 제출 중 중복 클릭 방지를 포함한다.

- [ ] **Step 8: 페이지 테스트 통과 확인**

  Run: `node scripts/test-pages.mjs`

  Expected: 모든 인증 경로와 기본 폼 의미가 통과한다.

- [ ] **Step 9: 인증 UI 커밋**

  Run: `git add package.json package-lock.json app/firebase-client.ts app/api/auth/config app/auth app/signup app/login app/verify-email app/globals.css scripts/test-pages.mjs && git commit -m "Add Firebase school account sign-up and login"`

---

### Task 5: 한국어 이메일 작업 화면

**Files:**
- Create: `app/auth/action/page.tsx`
- Create: `app/auth/action/action-handler.tsx`
- Modify: `app/globals.css`
- Modify: `scripts/test-pages.mjs`

- [ ] **Step 1: 이메일 작업 모드 페이지 테스트 작성**

  `verifyEmail`, `resetPassword`, `recoverEmail` 모드를 설명하는 한국어 UI와 잘못된 요청 안내가 렌더링되는지 검사한다.

- [ ] **Step 2: 새 테스트의 실패 확인**

  Run: `node scripts/test-pages.mjs`

  Expected: `/auth/action`이 없어서 실패한다.

- [ ] **Step 3: Firebase 작업 핸들러 구현**

  URL의 `mode`, `oobCode`, `continueUrl`, `lang`을 허용 목록으로 해석한다. 이메일 인증은 `applyActionCode`, 비밀번호 재설정은 `verifyPasswordResetCode`와 `confirmPasswordReset`, 이메일 복구는 `checkActionCode`와 `applyActionCode`를 사용한다.

- [ ] **Step 4: 열린 리디렉션 차단**

  `continueUrl`은 현재 사이트의 상대 경로만 허용하고 외부 URL, `//` URL과 인증 예약 경로는 `/login`으로 대체한다.

- [ ] **Step 5: 페이지 테스트 통과 확인**

  Run: `node scripts/test-pages.mjs`

  Expected: 세 모드와 오류 화면이 통과한다.

- [ ] **Step 6: 이메일 작업 화면 커밋**

  Run: `git add app/auth/action app/globals.css scripts/test-pages.mjs && git commit -m "Add Korean Firebase email action screens"`

---

### Task 6: 게시판 비회원 게이트와 공통 계정 UI

**Files:**
- Modify: `app/community.tsx`
- Modify: `app/posts/[id]/post-detail.tsx`
- Modify: `app/globals.css`
- Modify: `scripts/test-pages.mjs`
- Modify: `scripts/test-detail.mjs`
- Modify: `scripts/test-api.mjs`

- [ ] **Step 1: 비회원 화면과 API 차단 테스트 보강**

  비회원 페이지에는 로그인·회원가입 안내가 보이고 게시글 API를 요청하지 않으며, 직접 상세 API와 모든 쓰기 요청은 `401`이어야 한다는 검증을 추가한다.

- [ ] **Step 2: 예상 실패 확인**

  Run: `node scripts/test-pages.mjs && node scripts/test-detail.mjs && node scripts/test-api.mjs`

  Expected: 기존 테스트가 비회원으로 게시글을 만들거나 읽으므로 실패한다.

- [ ] **Step 3: 목록 화면을 세션 우선 흐름으로 변경**

  `/api/session`이 완료된 뒤 회원일 때만 목록을 요청한다. 비회원에게는 공개 소개와 학교 이메일 가입 CTA를 표시한다. 헤더에는 비회원 로그인·가입, 회원 이름·계정·로그아웃을 표시한다.

- [ ] **Step 4: 상세 화면에 같은 회원 게이트 적용**

  상세 메타데이터 요청 전에 세션을 확인하고 비회원에게 게시글 제목이나 메타데이터를 노출하지 않는다. 회원에게는 기존 게시글 비밀번호 잠금 화면을 유지한다.

- [ ] **Step 5: 기존 통합 테스트에 테스트 회원 쿠키 적용**

  테스트가 D1에 준비한 회원 세션 쿠키를 모든 정상 게시판 요청에 전달하도록 바꾸고, 별도 비회원 거부 검증을 유지한다.

- [ ] **Step 6: 전체 게시판 테스트 통과 확인**

  Run: `node scripts/test-pages.mjs && node scripts/test-detail.mjs && node scripts/test-api.mjs`

  Expected: 회원 CRUD와 비회원 차단이 함께 통과한다.

- [ ] **Step 7: 회원 게이트 UI 커밋**

  Run: `git add app/community.tsx app/posts app/globals.css scripts/test-pages.mjs scripts/test-detail.mjs scripts/test-api.mjs && git commit -m "Gate community content behind school membership"`

---

### Task 7: 관리자 코드와 관리자 권한을 회원 세션으로 전환

**Files:**
- Modify: `app/api/admin/join/route.ts`
- Modify: `app/api/admin/members/route.ts`
- Modify: `app/api/admin/members/[userId]/route.ts`
- Modify: `app/admin/join/admin-join.tsx`
- Modify: `lib/server.ts`
- Modify: `scripts/test-admin-membership.mjs`
- Delete: `app/chatgpt-auth.ts`

- [ ] **Step 1: 회원 세션 기반 관리자 테스트로 변경**

  비회원 등록 `401`, 일반 회원의 잘못된 코드 `403`, 정상 코드 등록 `201`, 관리자 세션 확인, 자기 권한 회수 차단과 마지막 관리자 보호를 검증한다.

- [ ] **Step 2: 기존 ChatGPT 로그인 의존으로 실패하는지 확인**

  Run: `node scripts/test-admin-membership.mjs`

  Expected: D1 회원 쿠키를 관리자 등록이 인식하지 못해 실패한다.

- [ ] **Step 3: 관리자 등록 API 전환**

  `requireMember`로 Firebase UID, 학교 이메일과 이름을 가져와 기존 관리자 코드 검증 후 `admin_users`에 저장한다. 사용자 UID별 제한과 IP 제한을 유지한다.

- [ ] **Step 4: 관리자 조회와 회수 안전장치 보강**

  모든 관리자 API는 활성 회원이면서 활성 관리자여야 한다. 자기 권한 회수와 마지막 활성 관리자 회수를 차단한다.

- [ ] **Step 5: 관리자 등록 화면 전환**

  ChatGPT 로그인 링크를 `/login?returnTo=/admin/join`으로 바꾸고 현재 학교 계정 정보를 표시한다.

- [ ] **Step 6: 사용하지 않는 ChatGPT 인증 코드 제거**

  저장소 전체에서 `chatgpt-auth`, `signin-with-chatgpt`, `getChatGPTUser` 참조가 없는지 `rg`로 확인한 뒤 파일을 삭제한다.

- [ ] **Step 7: 관리자 테스트 통과 확인**

  Run: `node scripts/test-admin-membership.mjs && node scripts/test-api.mjs`

  Expected: 관리자 등록·승인과 일반 회원 차단이 통과한다.

- [ ] **Step 8: 관리자 전환 커밋**

  Run: `git add -A app/api/admin app/admin/join lib/server.ts scripts/test-admin-membership.mjs scripts/test-api.mjs app/chatgpt-auth.ts && git commit -m "Use school member sessions for administration"`

---

### Task 8: 회원 프로필, 이메일 변경과 탈퇴

**Files:**
- Create: `app/api/account/route.ts`
- Create: `app/account/page.tsx`
- Create: `app/account/account-panel.tsx`
- Modify: `lib/member-auth.ts`
- Modify: `app/globals.css`
- Create: `scripts/test-account-admin.mjs`

- [ ] **Step 1: 계정 관리 API 실패 테스트 작성**

  비회원 `401`, 이름 2자 미만 `400`, 인증되지 않은 ID 토큰 `401`, 다른 도메인 이메일 `403`, 정상 이름·이메일 동기화, 탈퇴 후 모든 세션 폐기와 마지막 관리자 탈퇴 차단을 검증한다.

- [ ] **Step 2: API가 없어 실패하는지 확인**

  Run: `node scripts/test-account-admin.mjs`

  Expected: `/api/account`가 `404`이므로 실패한다.

- [ ] **Step 3: 프로필 동기화 API 구현**

  새 Firebase ID 토큰을 다시 검증하고 UID가 현재 D1 회원과 같은지 확인한다. 이름과 인증 완료된 학교 이메일만 갱신하며 이메일이 바뀌면 사용자의 모든 세션을 폐기한다.

- [ ] **Step 4: 탈퇴 API 구현**

  확인 문구와 현재 세션을 요구한다. 마지막 활성 관리자는 거부하고, 허용된 경우 트랜잭션 순서로 세션, 관리자 권한과 회원 프로필을 정리한다. 게시글은 유지한다.

- [ ] **Step 5: 계정 화면 구현**

  이름 변경, `verifyBeforeUpdateEmail`, 비밀번호 재설정, 최근 재인증과 `deleteUser`를 포함한다. Firebase 계정 삭제 성공 후 서버 D1 정리를 호출하고 실패 시 재로그인 안내를 제공한다.

- [ ] **Step 6: 계정 테스트 통과 확인**

  Run: `node scripts/test-account-admin.mjs`

  Expected: 프로필·이메일·탈퇴의 성공과 차단 케이스가 통과한다.

- [ ] **Step 7: 계정 관리 커밋**

  Run: `git add app/api/account app/account lib/member-auth.ts app/globals.css scripts/test-account-admin.mjs && git commit -m "Add verified member account management"`

---

### Task 9: 관리자 회원 검색·정지·복구

**Files:**
- Create: `app/api/admin/users/route.ts`
- Create: `app/api/admin/users/[userId]/route.ts`
- Create: `app/admin/members/page.tsx`
- Create: `app/admin/members/member-manager.tsx`
- Modify: `app/community.tsx`
- Modify: `app/globals.css`
- Modify: `scripts/test-account-admin.mjs`

- [ ] **Step 1: 관리자 회원 관리 실패 테스트 작성**

  일반 회원 `403`, 이름·이메일 검색, 페이지 제한, 정지 즉시 세션 삭제, 정지 계정 세션 재발급 거부, 복구, 자기 정지 차단과 마지막 활성 관리자 보호를 검증한다.

- [ ] **Step 2: API가 없어 실패하는지 확인**

  Run: `node scripts/test-account-admin.mjs`

  Expected: `/api/admin/users`가 `404`이므로 실패한다.

- [ ] **Step 3: 검색 API 구현**

  검색어를 100자로 제한하고 `%`, `_`, `\\`를 LIKE 이스케이프한다. 한 페이지 최대 50명, 기본 20명으로 제한하고 비밀번호·토큰·관리자 코드 관련 값은 반환하지 않는다.

- [ ] **Step 4: 정지·복구 API 구현**

  `active`와 `suspended` 명령만 받는다. 정지 시 대상 세션을 같은 요청에서 삭제하고, 자기 정지와 마지막 활성 관리자 정지를 차단한다. 복구는 새 로그인을 허용하되 세션을 자동 발급하지 않는다.

- [ ] **Step 5: 관리자 회원 화면 구현**

  검색, 상태 필터, 페이지 이동, 정지·복구 확인 대화상자, 빈 결과와 오류 상태를 제공한다. 관리자 뉴스 승인 화면에서 회원 관리 링크를 노출한다.

- [ ] **Step 6: 관리자 회원 테스트 통과 확인**

  Run: `node scripts/test-account-admin.mjs && node scripts/test-admin-membership.mjs`

  Expected: 검색·정지·복구와 관리자 보호가 통과한다.

- [ ] **Step 7: 회원 관리 커밋**

  Run: `git add app/api/admin/users app/admin/members app/community.tsx app/globals.css scripts/test-account-admin.mjs && git commit -m "Add administrator member controls"`

---

### Task 10: 문서·회귀 검증과 Firebase 운영 준비

**Files:**
- Modify: `README.md`
- Modify: `docs/implementation.md`
- Modify: `docs/verification.md`
- Modify: `scripts/check-final.mjs` if it owns the final command list

- [ ] **Step 1: 운영 문서 갱신**

  Firebase 프로젝트 생성, Email/Password 활성화, 웹 앱 설정, 승인 도메인, 한국어 이메일 템플릿, `/auth/action` URL, 네 Sites 환경 변수와 로컬 설정 방법을 작성한다. ChatGPT 로그인 설명을 모두 제거한다.

- [ ] **Step 2: 오래된 인증 참조 검사**

  Run: `rg -n "ChatGPT 계정|signin-with-chatgpt|getChatGPTUser|ADMIN_EMAIL|관리자 이메일" . --glob '!node_modules/**' --glob '!dist/**'`

  Expected: 의도적으로 남긴 마이그레이션 설명 외에는 결과가 없다.

- [ ] **Step 3: 전체 자동 검증 실행**

  Run: `node --experimental-strip-types scripts/test-firebase-token.mjs`

  Run: `node scripts/test-member-access.mjs`

  Run: `node scripts/test-account-admin.mjs`

  Run: `node scripts/test-admin-membership.mjs`

  Run: `node scripts/test-api.mjs`

  Run: `node scripts/test-detail.mjs`

  Run: `node scripts/test-pages.mjs`

  Run: `npm run lint`

  Run: `npx tsc --noEmit`

  Run: `npm run build`

  Expected: 모든 명령이 경고 없는 성공 상태로 끝나고 빌드 경로에 인증·계정·관리자 회원 페이지와 API가 포함된다.

- [ ] **Step 4: 문서와 검증 커밋**

  Run: `git add README.md docs scripts/check-final.mjs && git commit -m "Document Firebase member operations"`

---

### Task 11: Firebase 연결, 비공개 검증과 공개 배포

**External setup:** Firebase Console, Sites environment and access policy

- [ ] **Step 1: Firebase 프로젝트 설정값 확보**

  Firebase Console에서 Email/Password를 활성화하고 웹 앱을 만든다. `apiKey`, `authDomain`, `projectId`, `appId`를 확보하며 실제 비밀번호나 서비스 계정 키는 만들거나 전달하지 않는다.

- [ ] **Step 2: Firebase 승인 도메인과 메일 작업 URL 설정**

  `micom-campus-20260915.sudal0-0.chatgpt.site`를 승인 도메인에 추가하고 인증·재설정 템플릿의 작업 URL을 `https://micom-campus-20260915.sudal0-0.chatgpt.site/auth/action`으로 지정한다.

- [ ] **Step 3: Sites 운영 환경 변수 설정**

  네 Firebase 공개 값을 Sites 환경 변수로 설정하고 기존 관리자 코드 해시·salt를 보존한다.

- [ ] **Step 4: 최종 소스 푸시와 사이트 버전 저장**

  전체 검증 후 정확한 `HEAD`를 Sites 소스 저장소에 푸시하고 같은 SHA의 빌드 산출물을 패키징해 새 버전을 저장한다.

- [ ] **Step 5: 소유자 전용 상태로 먼저 배포**

  접근 정책을 바꾸지 않은 채 새 버전을 배포하고 배포 상태가 `succeeded`인지 확인한다.

- [ ] **Step 6: 실제 학교 이메일 스모크 테스트**

  실제 `@ks.ac.kr` 계정으로 가입, 인증 메일 수신, 한국어 작업 화면, 로그인, 목록 접근, 게시글 작성, 로그아웃과 관리자 코드 등록을 확인한다. 미인증 계정과 비학교 이메일이 차단되는지 함께 확인한다.

- [ ] **Step 7: Sites 접근 정책을 공개로 변경**

  스모크 테스트가 통과한 경우에만 access mode를 `public`으로 바꾸고 시크릿 브라우저에서 첫 화면은 열리지만 게시판 데이터는 보이지 않는지 확인한다.

- [ ] **Step 8: 운영 검증 기록 남기기**

  배포 버전, 커밋 SHA, 환경 변수 개정, 접근 정책과 수동 검증 결과를 `docs/verification.md`에 기록하고 마지막 문서 커밋·배포가 필요하면 같은 절차를 반복한다.
