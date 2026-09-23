# 미컴 라운지 인수인계 (2026-09-23 기준)

새 세션에서 이 저장소를 이어받을 때 먼저 읽는 문서입니다. 기능 사양은 [docs/implementation.md](implementation.md),
백업·복구는 [docs/backup.md](backup.md), 검증 범위는 [docs/verification.md](verification.md),
구조 그림은 [docs/architecture/micom-lounge.html](architecture/micom-lounge.html),
사용자용 설명은 사이트 `/help`(`app/help/help-page.tsx`)에 있습니다.

> git 저장소 루트는 `web/` 폴더입니다. 그 위 폴더(`미컴 앱/`)의 `.claude/launch.json`, 기획 문서, `*.tar.gz`는 저장소 밖입니다.

## 1. 서비스 한눈에

경성대 미디어커뮤니케이션학과 커뮤니티. 학교 이메일(`@ks.ac.kr`) 회원만 이용합니다.

| 항목 | 값 |
|---|---|
| 운영 주소 | https://micom.loungee.workers.dev |
| 저장소 | https://github.com/Hasasudal/me-comm-app (`main` 병합 시 자동 배포) |
| 앱 | Cloudflare Worker `micom` — vinext(Vite 위의 Next.js), 화면과 API를 한 Worker에서 처리 |
| DB | Cloudflare D1 `micom-lounge` (id `eee8564e-e13a-4394-b0f7-af5d9688e62d`) |
| 사진 | R2 `micom-images` |
| 백업 | R2 `micom-backups` (주간 자동, 180일 후 만료) |
| 로그인 | Firebase Auth 프로젝트 `mecomm-project` (이메일·비밀번호 + 이메일 인증) |
| 계정 | Cloudflare `c6585635ced99c193cb7a7fdadb6b927` |

## 2. 게시판과 권한

게시판: 통합(`/`), 자유게시판(`/board`), 학사문의(`/inquiry`), 학생회 건의(`/complaint`), 학과 뉴스(`/news`),
동아리(`/clubs`), 공모전 모집(`/contests`). 그 밖에 `/help`, `/account`, `/admin`, `/admin/members`,
`/login`, `/signup`, `/verify-email`, `/auth/action`(Firebase 이메일 링크 처리).

직책은 `users.role` 한 가지: `member`(일반) · `academic`(학사) · `council`(학생회) · `admin`(관리자).

- **학사문의·학생회 건의(“desk”)**: 작성자와 담당 직책(+관리자)만 열람. 담당자가 댓글로 답하면 `resolved_at`이 차고
  (답변/처리 완료), 작성자가 다시 댓글을 달면 비워집니다(대기). `lib/server.ts`의 `deskRoles`, `managesDesk`,
  `visiblePost`, `seesWriters`가 기준입니다.
- **학과 뉴스**: 작성자와 관리자만. 상태는 `pending`/`feedback`/`rejected`/`published`. 관리자 검토 화면에서 형광펜·굵게·메모
  주석(본문 오프셋 기반, `lib/annotations.ts`)과 승인/피드백/반려, Word 내보내기(`lib/news-docx.ts`, 사진 포함).
- **공개 게시판**: 로그인 회원 모두 열람. 관리자만 상단 고정(`pinned_at`).
- **글·댓글 이름은 “별명”**입니다. 실제 계정(이름·이메일)은 관리자(+해당 desk 담당자)에게만 서버가 내려줍니다
  (`writerOf`, `WriterTag`).
- **글 비밀번호**: 로그인한 작성자와 관리자는 필요 없음. 다른 계정이 수정·삭제할 때만 필요(PBKDF2 10만 회).
- **가입 승인**: 학교 메일이 인증 메일을 막는 경우가 있어, 인증하지 않은 계정이 로그인하면 `status='pending'`으로
  기록되고 관리자가 승인(`active`)/거절(`suspended`)합니다. 인증을 마치면 승인 없이 자동 활성화됩니다.
- **직책·상태 변경은 `member_audit`에 기록**되고 회원·직책 관리 화면 아래에서 볼 수 있습니다.

## 3. 코드 구조

```
web/
  app/                 화면(클라이언트 컴포넌트 중심) + app/api/** 라우트 핸들러
    app-shell.tsx      사이드바·상단바·알림 벨·직책 라벨·접기(localStorage)
    community.tsx      게시판 목록/검색/필터/글쓰기 모달 (모든 게시판이 공유)
    posts/[id]/        글 상세, 댓글
    admin/             뉴스 검토(review-workspace), 회원·직책 관리(members)
    help/              사이트 안 사용설명서 (기능 바꾸면 여기도 갱신)
    login/ signup/ verify-email/ auth/action/   가입·로그인·이메일 인증 (firebase-client.ts)
    site-notice.tsx    전 페이지 상단 배너 (SITE_NOTICE = null 로 제거)
    image-picker.tsx   사진 업로드(브라우저에서 1600px 축소)·갤러리·Word용 JPEG 변환
    writer-tag.tsx     별명 옆 실제 계정 표시(관리자·담당자용)
  lib/                 서버 로직: server.ts(권한·검증·목록 SQL·rate limit), member-auth.ts(세션),
                       firebase-token.ts(ID 토큰 검증), images.ts(R2), database.ts(D1 연결),
                       password.ts(PBKDF2), search.ts, annotations.ts, news-docx.ts, recruitment.ts
  db/schema.ts         drizzle 스키마 (테이블: posts, comments, images, users, sessions, attempts, member_audit)
  drizzle/             마이그레이션 SQL (0000~0010). 배포 시 자동 적용
  scripts/test-*.mjs   통합 테스트 (로컬 dev 서버 필요)
  tests/*.test.ts      순수 함수 단위 테스트
  docs/                문서
```

## 4. 개발·배포 절차

```bash
cd web                       # 저장소 루트
npm ci                       # 최초 1회
npm run db:migrate:local     # 로컬 D1에 마이그레이션
# 개발 서버: Claude Code에서는 preview_start({name:"web"}) 사용, 포트 5173
npx tsc --noEmit && npm run lint && npm test
node scripts/test-api.mjs    # 통합 테스트 (dev 서버가 떠 있어야 함)
```

- **배포**: `main`에 병합하면 GitHub Actions(`.github/workflows/ci.yml`)가 검사 → D1 마이그레이션 → Worker 배포까지 수행합니다.
  로컬에서 직접 `npm run deploy` 할 일은 없습니다.
- **작업 흐름**: 브랜치 → 커밋 → PR → 검사 통과 확인 → 병합 → 배포 버전 ID와 운영 동작 확인. 병합 후 브랜치는 삭제합니다.
- **백업 워크플로**: `.github/workflows/backup.yml` (매주 월 03:00 KST, 수동 실행 가능).
- **비밀값**: `CLOUDFLARE_API_TOKEN`(GitHub Secret), Worker의 `FIREBASE_*`. 값은 사용자가 직접 등록하며 대화에 적지 않습니다.

## 5. 함정 모음 (겪은 것들)

- **D1은 빈 batch를 거부**합니다. `db().batch([])`가 되지 않도록 항상 길이를 확인하세요(사진 없는 글 저장 오류의 원인이었습니다).
- **vinext의 `headers()` source는 중첩 괄호를 지원하지 않습니다.** 부정 lookahead 패턴은 조용히 아무 경로와도 매칭되지 않습니다.
  현재 페이지 경로를 나열해 `Cache-Control: no-cache`를 주고 있으니, 페이지를 추가하면 `next.config.ts`도 갱신하세요.
- **`npm test`는 테스트 파일을 `package.json`에 하나씩 나열**합니다. `tests/`에 새 파일을 만들면 거기에도 추가해야 실행됩니다.
  통합 테스트(`scripts/test-*.mjs`)는 CI에서 돌지 않으니 PR 전에 직접 돌리세요.
- **PBKDF2 반복 횟수는 Workers 상한이 10만 회**입니다. 더 올리면 런타임 오류가 납니다.
- **rate limit**: 글 10/분, 댓글 20/분, 사진 30/분, 비밀번호 10/분, 로그인 IP 120/분 + 계정 10/분.
  통합 테스트를 연달아 돌리면 걸리므로 `execute('DELETE FROM attempts')`로 창을 비웁니다.
- **테스트 계정**: `scripts/test-member-fixture.mjs`가 D1에 직접 세션을 넣어 만듭니다. 실제 Firebase 로그인은 로컬에서 재현할 수 없어,
  필요하면 Identity Toolkit REST로 임시 계정을 만들고 확인 뒤 삭제했습니다.
- **Windows 셸**: 한국어 경로라 따옴표 필수. 복잡한 문자열 치환은 셸 대신 Python 스크립트나 Edit 도구로 합니다.
- **작업 후 정리**: 브라우저 확인용으로 넣은 회원·글·세션은 반드시 삭제합니다.

## 6. 남은 일

| 우선 | 항목 | 메모 |
|---|---|---|
| 높음 | 학교 전산실에 `noreply@mecomm-project.firebaseapp.com` 수신 허용 요청 | 인증 메일 미수신의 근본 해결. 사용자 몫 |
| 중간 | 도메인 구매 → Firebase 발신 도메인·사이트 주소 | 스팸 분류 감소. 구매 후 DNS 설정 동행 필요 |
| 중간 | 학사 프린터 신청 기능 | 파일 업로드(R2), PDF 장수 자동 계산, 매수 제한, 조교 출력 → 수령 알림 |
| 낮음 | 테스트 계정 만들기 | `아이디+test1@ks.ac.kr` 방식 우선 확인, 안 되면 허용 목록 방식 |
| 낮음 | PC 카카오톡으로 채널 채팅 바로 열기 | 현재 PC 카톡이 지원하지 않아 보류. QR + 웹 채팅으로 대체 중 |
| 낮음 | 사이트 상단 배너 제거 | 인증 메일 문제 해결되면 `app/site-notice.tsx`의 `SITE_NOTICE = null` |

## 7. 사용자와 일하는 방식

- 보고와 설명은 **한국어**, 전문 용어는 풀어서 씁니다(예: “마이그레이션” 대신 “DB 변경 파일”).
- 기능을 바꾸면 **사이트 도움말(`/help`)도 같은 PR에서 갱신**합니다.
- 되돌리기 어려운 작업(운영 DB 삭제, 결제, 리소스 삭제)은 먼저 확인을 받습니다. 토큰·비밀번호는 대신 입력하지 않습니다.
- 확인하지 않은 것은 “확인하지 못했다”고 분명히 적습니다.
