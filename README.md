# 미컴 라운지

학과 커뮤니티 웹의 1차 구현입니다. 상위 폴더의 `학과-커뮤니티-서비스-기획.md`를 기준으로 작성했습니다.

## 구현 기능

- 통합 게시판, 학과 뉴스, 동아리, 공모전 모집
- 게시글 작성 및 D1 영구 저장
- 목록에는 제목·분류·작성일만 표시
- 서버 비밀번호 확인 후 본문 열람·수정·삭제
- 무작위 salt와 PBKDF2 해시로 게시글 비밀번호 저장
- 뉴스 제출 후 승인 대기, 관리자 검토·수정·승인 후 공개
- 승인된 뉴스의 작성자 수정 시 재승인
- 모바일 화면, 오류 안내, 빈 목록 안내

## 실행

Node.js 22.13 이상이 필요합니다.

```sh
npm run install:ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_lively_kylun.sql
npm run dev
```

위 데이터베이스 생성 명령은 새 로컬 저장소에서 한 번만 실행합니다. 현재 작업 폴더에는 이미 적용되어 있습니다.

## 관리자 설정은 보류 중

운영 환경에서 `ADMIN_EMAIL`에 관리자 ChatGPT 계정 이메일을 지정하면 해당 계정만 뉴스 승인 기능을 사용할 수 있습니다. 미설정 상태에서는 접근이 차단됩니다.

로컬 개발에서는 `.dev.vars`를 사용합니다. `.dev.vars.example`을 참고하세요. 로컬 프레임워크의 테스트 로그인은 `seedy@sites.test`이며 운영 빌드에는 이 로그인 기능이 포함되지 않습니다. 실제 운영 권한은 플랫폼 로그인과 서버 이메일 검사로 확인합니다.

## 검증

```sh
npx tsc --noEmit
npm run build
```

`scripts/test-api.mjs`는 로컬 개발 서버와 일시적으로 설정한 테스트 관리자 환경에서만 실행합니다. 네 종류의 글을 생성해 비밀번호·승인·수정·삭제를 확인하고 자신이 생성한 글만 삭제합니다. 테스트 종료 후 관리자 설정을 다시 비워야 합니다.

자세한 범위와 검증 기록은 `docs/implementation.md`, `docs/verification.md`에 있습니다.
