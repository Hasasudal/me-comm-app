# 동아리별 칸 설계 (2026-09-23)

동아리 게시판(`/clubs`)의 글을 동아리별 칸으로 나눈다. 동아리 목록은 회원이 신청하고 관리자가 승인한다.
칸은 누구나 읽고 쓸 수 있고, 칸에는 글 목록만 둔다(소개글·회장 권한 없음).

## 데이터

- 새 테이블 `clubs`
  - `id` text PK, `name` text NOT NULL UNIQUE(1~30자, 앞뒤 공백 제거)
  - `status` text NOT NULL: `pending`(신청) | `active`(승인)
  - `requested_by` text(신청 회원 userId), `created_at` integer NOT NULL
  - 거절 = 행 삭제
- `posts.club_id` text NULL 추가 + 인덱스 `(club_id, created_at)`.
  `category='clubs'`인 글에만 값이 있다. 기존 동아리 글은 NULL 그대로.

## API

- `GET /api/clubs` (회원): 승인된 동아리 `{id,name}[]`, 이름순.
- `POST /api/clubs` (회원): `{name}`으로 신청. 같은 이름(대기·승인 포함)이 있으면 409. rate limit `club` 5/분.
- `GET /api/admin/clubs` (관리자): 대기·승인 전부 + 동아리별 글 수.
- `PATCH /api/admin/clubs/[id]` (관리자): `{status:'active'}` 승인, `{name}` 이름 변경(중복 409).
- `DELETE /api/admin/clubs/[id]` (관리자): 대기 신청 거절 또는 승인된 동아리 삭제. 글이 남아 있으면 409.
- `GET /api/posts?category=clubs&club=<id>`: 해당 동아리 글만.
- 글 작성(`POST /api/posts`): `category='clubs'`면 `club_id` 필수, 승인된 동아리여야 한다(아니면 400).
  다른 게시판 글은 `club_id`를 무시하고 NULL로 저장.
- 글 수정(`PATCH /api/posts/[id]`): 동아리 글은 `club_id` 변경 가능(같은 검증). 기존 NULL 글은 수정 시 선택하지 않으면 NULL 유지.

## 화면

- `/clubs` 목록 위에 칸 버튼: [전체] + 승인된 동아리들. 선택은 `?club=<id>`로 주소에 남는다.
  모집 중 필터·검색과 함께 동작한다. 목록 행에는 동아리 이름 태그를 보여준다.
- 글쓰기 모달: 동아리 게시판이면 동아리 선택(필수). 칸을 보고 있었다면 그 동아리가 미리 선택된다.
  승인된 동아리가 하나도 없으면 "먼저 동아리 개설을 신청하세요" 안내.
- "동아리 개설 신청" 버튼(동아리 게시판) → 이름 입력 → 신청 완료 안내.
- 관리자: `/admin/members` 아래 "동아리 관리" 칸 — 대기 신청 승인/거절, 승인된 동아리 이름 변경·삭제.
- 글 상세·수정에서 동아리 이름 표시·변경.

## 테스트·문서

- 통합 테스트 `scripts/test-clubs.mjs`: 신청 → 중복 신청 409 → 대기 동아리로 글 작성 400 → 승인 →
  글 작성 → 칸별 목록 → 이름 변경 → 글 있는 동아리 삭제 409 → 정리.
- `/help` 동아리 설명 갱신, `docs/handoff.md` 테이블·마이그레이션 번호 갱신.
