# Firebase 회원 시스템 구현 범위

## 접근 정책

- 방문자는 모든 게시판 주소에 접근할 수 있지만 소개, 로그인, 회원가입 안내만 볼 수 있습니다.
- Firebase에서 이메일 인증을 마친 정확한 `@ks.ac.kr` 계정만 앱 세션을 받을 수 있습니다.
- 회원 세션은 `HttpOnly`, `Secure`, `SameSite=Lax` 쿠키로 14일 유지합니다. D1에는 세션의 SHA-256 해시만 저장합니다.
- 정지된 회원은 새 세션을 만들 수 없고 기존 세션은 정지 처리와 동시에 삭제됩니다.

## 게시판

- `/`, `/news`, `/clubs`, `/contests`는 서로 다른 주소와 게시판 화면을 제공합니다.
- 목록에는 제목·분류·작성일과 모집 정보만 표시합니다. 본문은 게시글 비밀번호 확인 후 반환합니다.
- 게시글 비밀번호는 무작위 salt와 PBKDF2 해시로 저장합니다.
- 뉴스는 제출 후 승인 대기가 되며 `/admin`에서 승인된 뒤 공개됩니다. 공개 뉴스를 작성자가 수정하면 다시 승인 대기로 전환합니다.

## 계정과 관리자

- `/signup`, `/login`, `/verify-email`, `/auth/action`은 가입, 로그인과 한국어 이메일 작업을 담당합니다.
- `/account`에서 이름, 학교 이메일, 비밀번호 재설정과 탈퇴를 관리합니다. 이메일과 이름 변경은 새 Firebase ID 토큰을 서버에서 다시 검증합니다.
- `/admin/join`에서 로그인 회원이 관리자 초대 코드를 등록합니다. 코드 원문은 저장하지 않고 PBKDF2 해시와 salt만 환경 변수에 둡니다.
- `/admin/members`에서 관리자가 회원을 검색하고 이용 정지·복구할 수 있습니다. 현재 관리자 자기 정지와 마지막 관리자 제거는 차단합니다.

## 운영 설정 순서

1. Firebase 웹 앱을 등록하고 Email/Password 로그인을 활성화합니다.
2. 운영 도메인을 Firebase 승인 도메인에 추가합니다.
3. 이메일 작업 템플릿의 사용자 지정 작업 URL을 `https://micom-campus-20260915.sudal0-0.chatgpt.site/auth/action`으로 설정합니다.
4. Sites 환경에 `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_APP_ID`를 추가합니다.
5. 기존 `ADMIN_JOIN_CODE_HASH`, `ADMIN_JOIN_CODE_SALT`를 보존합니다.
6. D1에 `drizzle/0003_school_members.sql`을 적용합니다.
7. 사이트를 소유자 전용으로 먼저 배포해 실제 학교 이메일 인증을 확인합니다.
8. 성공한 뒤 Sites 접근 정책을 공개로 바꿉니다.
