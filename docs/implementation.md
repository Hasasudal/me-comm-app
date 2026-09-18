# Firebase 회원 시스템 구현 범위

## 접근 정책

- 방문자는 모든 게시판 주소에 접근할 수 있지만 소개, 로그인, 회원가입 안내만 볼 수 있습니다.
- Firebase에서 이메일 인증을 마친 정확한 `@ks.ac.kr` 계정만 앱 세션을 받을 수 있습니다.
- 회원 세션은 `HttpOnly`, `Secure`, `SameSite=Lax` 쿠키로 14일 유지합니다. D1에는 세션의 SHA-256 해시만 저장합니다.
- 정지된 회원은 새 세션을 만들 수 없고 기존 세션은 정지 처리와 동시에 삭제됩니다.

## 게시판

- `/`, `/board`, `/news`, `/clubs`, `/contests`는 서로 다른 주소와 게시판 화면을 제공합니다. 통합 게시판(`/`)에는 뉴스를 제외한 글이 모입니다.
- 로그인 회원은 비밀번호 없이 본문을 봅니다. 게시글 비밀번호는 수정·삭제 확인에만 쓰며, 관리자는 비밀번호 없이 수정·삭제할 수 있습니다.
- 글마다 작성자 계정(`author_id`), 직접 입력한 작성자 이름, 선택 입력 머릿글을 저장합니다. 이 컬럼이 생기기 전의 글은 작성자 계정이 비어 있습니다.
- 게시글 비밀번호는 무작위 salt와 PBKDF2 해시로 저장합니다.

## 댓글·검색

- 뉴스를 제외한 게시판 글에 댓글을 답니다. 이름은 글처럼 직접 입력하고, 삭제는 작성한 계정과 관리자만 할 수 있습니다(비밀번호 없음). 글을 지우면 댓글도 함께 지웁니다.
- 검색은 제목·머릿글·본문·작성자 이름을 서버에서 찾고, 본문이 맞으면 앞뒤 일부만 보여줍니다. 뉴스는 통합 검색에 포함되지 않습니다.

## 학과 뉴스 검토

- 뉴스는 작성자 본인과 관리자만 볼 수 있습니다. 승인된 기사도 다른 회원에게 공개하지 않습니다.
- 상태는 `pending`(승인 대기), `feedback`(피드백), `rejected`(반려), `published`(승인) 네 가지입니다.
- `/admin`은 상태별 탭으로 기사를 보여줍니다. 승인 대기 기사에서 본문을 드래그해 형광펜·굵게·메모를 남기고 피드백을 보내거나, 사유를 적어 반려하거나, 승인합니다.
- 피드백은 `{note, marks[]}` JSON으로 `feedback` 컬럼에 저장하며, 표시 위치는 본문 문자열 오프셋입니다.
- 관리자는 기사 1개 또는 승인된 기사 전체를 Word(.docx)로 내보냅니다. 파일은 브라우저에서 만들어지며 `docx` 라이브러리는 내보낼 때만 불러옵니다.
- 작성자가 피드백 받은 기사나 승인된 기사를 수정하면 다시 승인 대기로 바뀌고 이전 피드백은 지워집니다. 반려된 기사는 작성자가 수정할 수 없습니다.

## 계정과 관리자

- `/signup`, `/login`, `/verify-email`, `/auth/action`은 가입, 로그인과 한국어 이메일 작업을 담당합니다.
- `/account`에서 이름, 학교 이메일, 비밀번호 재설정과 탈퇴를 관리합니다. 이메일과 이름 변경은 새 Firebase ID 토큰을 서버에서 다시 검증합니다.
- `/admin/join`에서 로그인 회원이 관리자 초대 코드를 등록합니다. 코드 원문은 저장하지 않고 PBKDF2 해시와 salt만 환경 변수에 둡니다.
- `/admin/members`에서 관리자가 회원을 검색하고 이용 정지·복구할 수 있습니다. 현재 관리자 자기 정지와 마지막 관리자 제거는 차단합니다.

## 운영 설정 순서 (Cloudflare Workers + D1)

1. `npx wrangler login`으로 Cloudflare 계정에 로그인합니다.
2. `npx wrangler d1 create micom-lounge`를 실행하고 출력된 `database_id`를 `wrangler.jsonc`에 넣습니다.
3. `npm run db:migrate:remote`로 `drizzle/0000`~`0004`를 운영 D1에 적용합니다.
4. `npx wrangler secret put <이름>`으로 `ADMIN_JOIN_CODE_HASH`, `ADMIN_JOIN_CODE_SALT`, `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_APP_ID`를 등록합니다.
5. `npm run deploy`로 빌드와 배포를 진행합니다. 기본 주소는 `https://micom-lounge.<계정 서브도메인>.workers.dev`입니다.
6. Firebase 승인 도메인에 배포 주소를 추가합니다. 이메일 작업 URL은 Firebase 기본값을 유지합니다(콘솔에서 사용자 지정 URL 저장 시 400 오류, Identity Platform 미사용). 인증·재설정 링크는 Firebase 기본 화면에서 처리된 뒤 계속 버튼으로 `/login`에 돌아오며, `/auth/action` 화면은 사용자 지정 작업 URL을 설정할 때만 쓰입니다.
7. 실제 학교 이메일로 가입·인증·로그인·글 작성·뉴스 검토를 확인합니다.
8. 필요하면 Cloudflare 대시보드에서 Worker에 사용자 도메인을 연결하고 6번을 그 도메인으로 다시 설정합니다.

## 자동 검사와 배포 (GitHub Actions)

`.github/workflows/ci.yml`은 PR과 `main` 푸시마다 타입 검사, 린트, 단위 테스트, 빌드를 실행합니다. `main`에 합쳐지면 이어서 운영 D1에 DB 변경을 적용하고 Worker를 배포합니다.

처음 한 번 GitHub 저장소 비밀 값을 등록해야 합니다.

1. Cloudflare 대시보드 → 내 프로필 → API 토큰 → 토큰 생성 → "Cloudflare Workers 편집" 템플릿을 고릅니다.
2. 권한에 **계정 · D1 · 편집**을 추가하고, 계정 리소스를 이 계정으로 제한해 토큰을 만듭니다.
3. GitHub 저장소 → Settings → Secrets and variables → Actions → New repository secret에서 이름 `CLOUDFLARE_API_TOKEN`으로 토큰을 저장합니다.

통합 테스트(`scripts/test-*.mjs`)는 개발 서버와 로컬 비밀 값이 필요해 CI에서 실행하지 않습니다. 기능을 바꾼 PR은 로컬에서 먼저 돌립니다.
