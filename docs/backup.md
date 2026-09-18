# DB 백업·복구 가이드

미컴 라운지의 데이터는 세 군데에 나뉘어 있습니다. 각각 백업 방법이 다릅니다.

| 저장소 | 들어 있는 것 | 자동 보호 | 직접 백업 |
|---|---|---|---|
| Cloudflare D1 `micom-lounge` | 회원, 게시글, 댓글, 관리자, 사진 목록 | Time Travel (시점 복구) | `wrangler d1 export` |
| Cloudflare R2 `micom-images` | 사진 파일 | 없음 | 아래 "사진(R2)" 참고 |
| Firebase `mecomm-project` | 로그인 계정(이메일·비밀번호) | Firebase가 관리 | 필요 없음 |

모든 명령은 `web` 폴더에서 실행합니다. 처음 한 번은 `npx wrangler login`으로 Cloudflare에 로그인해야 합니다.

## 1. 자동 보호: Time Travel (시점 복구)

D1은 따로 설정하지 않아도 모든 변경 기록을 보관합니다. 지난 기간 안의 **아무 시점으로나** DB 전체를 되돌릴 수 있습니다.

- 보관 기간: Workers 무료 플랜 7일, 유료 플랜 30일
- 되돌리면 **DB 전체**가 그 시점으로 돌아갑니다. 그 뒤에 쓴 글, 댓글, 가입도 함께 사라집니다.

### 현재 시점 기록해 두기

위험한 작업(대량 삭제, 직접 SQL 실행) 전에 지금 시점의 북마크를 적어 두세요.

```bash
npx wrangler d1 time-travel info micom-lounge
```

출력의 `bookmark` 값을 메모해 두면, 문제가 생겼을 때 정확히 그 시점으로 돌아갈 수 있습니다.

### 특정 시점으로 되돌리기

```bash
# 한국 시간 2026-09-18 오후 3시로 되돌리기 (RFC3339, +09:00 포함)
npx wrangler d1 time-travel restore micom-lounge --timestamp=2026-09-18T15:00:00+09:00

# 적어 둔 북마크로 되돌리기
npx wrangler d1 time-travel restore micom-lounge --bookmark=<북마크>
```

- 복구 명령은 되돌리기 **직전의 북마크**를 알려 줍니다. 잘못 되돌렸다면 그 북마크로 다시 restore 하면 원래대로 돌아옵니다.
- 복구 중에는 사이트가 잠시 DB에 접근하지 못할 수 있습니다. 사용자가 적은 시간에 하세요.

## 2. 직접 백업: SQL 파일로 내보내기

Time Travel 기간보다 오래 보관하거나, 다른 곳에 사본을 두고 싶을 때 씁니다.

```bash
mkdir -p backups
npx wrangler d1 export micom-lounge --remote --output=backups/micom-$(date +%Y%m%d).sql
```

- 내보내는 동안(수 초) DB가 잠깁니다.
- **파일에 회원 이메일이 들어 있습니다.** 공유 드라이브나 메신저에 올리지 말고, 개인 보관함이나 암호가 걸린 저장소에 두세요.
- `backups/` 폴더는 `.gitignore`에 들어 있어 GitHub에 올라가지 않습니다.

### 자동 백업 (매주)

GitHub Actions의 **DB backup** 작업이 매주 월요일 새벽 3시(한국 시간)에 운영 DB를 SQL 파일로 내보내 비공개 R2 버킷 `micom-backups`에 올립니다. 파일 이름은 `micom-YYYYMMDD-HHMM.sql`이고, 버킷 설정으로 **180일이 지나면 자동 삭제**됩니다.

- 바로 백업하려면 GitHub 저장소의 Actions → DB backup → Run workflow를 누릅니다.
- 내려받기: Cloudflare 대시보드 R2 → `micom-backups`에서 파일을 받거나 `npx wrangler r2 object get micom-backups/<파일 이름> --file=backups/<파일 이름> --remote`
- 같은 Cloudflare 계정 안에 있으므로, 계정 자체를 잃는 경우까지 대비하려면 가끔 한 부를 개인 보관함에도 받아 두세요.

권장 주기 (수동 백업):

- 매달 1회
- DB 구조를 바꾸는 배포(`drizzle/` 폴더에 새 파일이 생기는 PR)를 합치기 직전
- 학기 초·말처럼 게시글이 많이 쌓인 뒤

### SQL 파일에서 복구하기

운영 DB에 바로 덮어쓰지 말고, **새 DB를 만들어** 복구한 뒤 내용을 확인하고 바꿉니다.

```bash
# 1) 복구용 새 DB 만들기 (출력의 database_id를 적어 둠)
npx wrangler d1 create micom-lounge-restore

# 2) 백업 파일 넣기
npx wrangler d1 execute micom-lounge-restore --remote --file=backups/micom-20260918.sql

# 3) 내용 확인
npx wrangler d1 execute micom-lounge-restore --remote --command "SELECT category, COUNT(*) FROM posts GROUP BY category"
```

확인이 끝나면 `wrangler.jsonc`의 `database_name`과 `database_id`를 새 DB로 바꾸고 main에 합쳐 배포합니다. 기존 DB는 바로 지우지 말고 며칠 두었다가 정리하세요.

## 3. 사진(R2)

R2는 Time Travel 같은 자동 복구가 없습니다. 삭제된 사진은 되돌릴 수 없습니다.

- 게시글을 지우거나 수정에서 사진을 빼면 사진 파일도 함께 지워집니다. 이것이 R2에서 사진이 사라지는 유일한 경로입니다.
- 사진 목록(어떤 글에 어떤 사진이 붙어 있는지)은 D1의 `images` 테이블에 있으므로 위의 D1 백업에 포함됩니다.
- 사진 파일 자체까지 보관해야 한다면, Cloudflare 대시보드의 R2 → `micom-images`에서 파일을 내려받거나 rclone 같은 도구로 통째로 복사합니다. 사진이 많아지면 이 작업을 자동화하는 것을 검토하세요.

## 4. 설정값(시크릿)

`FIREBASE_*` 값은 DB가 아니라 Cloudflare Worker 설정에 저장되어 있어 DB 복구와 상관없이 유지됩니다.

- 회원 직책(`users.role`)은 DB에 있으므로 DB 백업·복구에 함께 포함됩니다. 복구한 시점 이후에 바꾼 직책은 다시 정해 주세요.
- Firebase 값은 Firebase 콘솔의 프로젝트 설정에서 언제든 다시 확인할 수 있습니다.

## 5. 관리자 복구

사이트 안에서는 마지막 관리자의 직책 변경·정지·탈퇴가 막혀 있어 관리자가 0명이 되지 않습니다. 다만 관리자가 로그인할 수 없게 된 경우(졸업으로 학교 메일을 쓸 수 없어 비밀번호를 재설정하지 못할 때 등)에는 Cloudflare 계정으로 직책을 직접 줄 수 있습니다.

1. 새 관리자가 될 사람이 먼저 사이트에 가입합니다.
2. Cloudflare에 로그인한 컴퓨터의 `web` 폴더에서 실행합니다.

```bash
npx wrangler d1 execute micom-lounge --remote --command "UPDATE users SET role='admin' WHERE email='새관리자@ks.ac.kr'"
```

3. 새 관리자가 로그인해 **회원·직책 관리**에서 다른 직책을 정리합니다.

이 명령은 Cloudflare 계정 권한이 있는 사람만 쓸 수 있습니다. 평소에는 **관리자를 2명 이상** 두면 이런 상황을 피할 수 있습니다.

## 문제가 생겼을 때 순서

1. 지금 상태를 먼저 내보내 둡니다: `wrangler d1 export ... --output=backups/before-restore.sql`
2. 언제부터 문제가 생겼는지 확인합니다.
3. 7일(유료 플랜은 30일) 이내라면 Time Travel로 그 직전 시점으로 되돌립니다.
4. 더 오래됐다면 가장 가까운 SQL 백업 파일로 새 DB를 만들어 복구합니다.
5. 되돌린 뒤 사이트에 로그인해 글 목록과 관리자 화면이 정상인지 확인합니다.
