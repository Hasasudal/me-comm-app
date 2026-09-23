# 동아리별 칸 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 동아리 게시판 글을 회원이 신청하고 관리자가 승인한 동아리별 칸으로 나눈다.

**Architecture:** 새 D1 테이블 `clubs`와 `posts.club_id` 칸. 동아리 API(`/api/clubs`, `/api/admin/clubs`)를 새로 두고,
기존 글 API는 `club_id`를 받아 검증·저장·필터한다. 화면은 `community.tsx`(칸 버튼·글쓰기 선택·신청),
`post-detail.tsx`(표시·수정), 새 `club-manager.tsx`(관리자 승인·이름 변경·삭제)를 고친다.

**Tech Stack:** vinext(Next.js 라우트 핸들러), Cloudflare D1, drizzle-kit(마이그레이션 생성), zod, React 클라이언트 컴포넌트.

**Spec:** `docs/superpowers/specs/2026-09-23-club-categories-design.md`

## Global Constraints

- 모든 명령은 저장소 루트 `web/`에서 실행. Windows 경로에 한국어가 있으니 따옴표 필수.
- 오류 메시지·화면 문구는 한국어.
- 동아리 이름: 앞뒤 공백 제거 후 1~30자, 대기·승인 포함 중복 불가(409).
- 동아리 신청 rate limit: scope `club`, 5/분, 회원 기준.
- `category='clubs'` 글만 `club_id`를 가진다. 새 동아리 글은 승인된 동아리 필수, 기존 NULL 글은 수정 시 선택 안 하면 NULL 유지.
- 글이 남은 동아리는 삭제 불가(409).
- D1 `batch([])` 금지(빈 배열 확인).
- 통합 테스트는 dev 서버(`preview_start({name:"web"})`, 포트 5173)와 빌드된 `dist/server/wrangler.json`이 필요.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: DB — `clubs` 테이블과 `posts.club_id`

**Files:**
- Modify: `db/schema.ts`
- Create: `drizzle/0011_club_categories.sql` (+ `drizzle/meta/0011_snapshot.json`, `_journal.json` 자동 생성)

**Interfaces:**
- Produces: 테이블 `clubs(id, name UNIQUE, status 'pending'|'active', requested_by, created_at)`, `posts.club_id`, 인덱스 `idx_posts_club(club_id, created_at)`.

- [ ] **Step 1: 스키마 수정** — `db/schema.ts`의 `posts` 컬럼 목록에서 `prefix` 다음 줄에 추가:

```ts
    club_id: text('club_id'),
```

  같은 테이블 인덱스 배열에 추가:

```ts
    index('idx_posts_club').on(table.club_id, table.created_at),
```

  파일 끝에 추가:

```ts
// Clubs are requested by members and approved by admins; club posts belong to one through posts.club_id.
export const clubs = sqliteTable(
  'clubs',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    status: text('status').notNull(), // 'pending' | 'active'
    requested_by: text('requested_by'),
    created_at: integer('created_at').notNull(),
  },
  (table) => [uniqueIndex('idx_clubs_name').on(table.name)],
);
```

- [ ] **Step 2: 마이그레이션 생성**

Run: `npx drizzle-kit generate --name club_categories`
Expected: `drizzle/0011_club_categories.sql` 생성. 내용에 `CREATE TABLE \`clubs\``, `CREATE UNIQUE INDEX \`idx_clubs_name\``,
`ALTER TABLE \`posts\` ADD \`club_id\` text`, `CREATE INDEX \`idx_posts_club\`` 네 문장만 있는지 확인(다른 테이블 재생성 문장이 있으면 중단하고 보고).

- [ ] **Step 3: 로컬 적용**

Run: `npm run db:migrate:local`
Expected: `0011_club_categories.sql` ✅

- [ ] **Step 4: Commit**

```bash
git add db/schema.ts drizzle
git commit -m "Add a clubs table and link club posts to it"
```

---

### Task 2: 동아리 API (신청·목록·관리자 승인·이름 변경·삭제)

**Files:**
- Create: `lib/clubs.ts`
- Create: `app/api/clubs/route.ts`
- Create: `app/api/admin/clubs/route.ts`
- Create: `app/api/admin/clubs/[id]/route.ts`
- Create: `scripts/test-clubs.mjs`

**Interfaces:**
- Consumes: Task 1 테이블. `lib/server.ts`의 `db, handle, HttpError, input, json, limit, requireMember, requireAdmin`.
- Produces:
  - `clubNameField: z.ZodString` (lib/clubs.ts)
  - `clubFor(category: string, clubId: string | null | undefined): Promise<string | null>` — clubs가 아니면 null,
    clubs인데 없거나 승인 안 됐으면 400.
  - `GET /api/clubs` → `{ clubs: { id: string; name: string }[] }` (승인된 것만, 이름순)
  - `POST /api/clubs {name}` → 201 `{ id }` / 409
  - `GET /api/admin/clubs` → `{ clubs: { id, name, status, requested_by_name: string|null, post_count: number, created_at }[] }`
  - `PATCH /api/admin/clubs/[id] {status?:'active', name?}` → `{ ok: true }` / 404 / 409
  - `DELETE /api/admin/clubs/[id] {}` → `{ ok: true }` / 404 / 409

- [ ] **Step 1: 실패하는 통합 테스트 작성** — `scripts/test-clubs.mjs`:

```js
import assert from 'node:assert/strict';
import { createMemberFixture, execute, setRole } from './test-member-fixture.mjs';
const base = 'http://localhost:5173';
const password = 'Test-only-1234';
const fixture = await createMemberFixture();
const admin = fixture.activeCookie,
  member = fixture.secondCookie;
async function request(path, { method = 'GET', body, cookie = member } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json', Origin: base } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() };
}
const post = (body) =>
  request('/api/posts', {
    method: 'POST',
    body: { title: '동아리 글', content: '본문', author_name: '별명', password, category: 'clubs', ...body },
  });
execute('DELETE FROM attempts'); // runs back to back would otherwise share rate-limit windows
setRole('test-member-active', 'admin');
const name = `테스트동아리${Date.now() % 100000}`;
const postIds = [];
let clubId;
try {
  assert.equal((await request('/api/clubs', { cookie: '' })).status, 401, 'anonymous list is denied');
  const applied = await request('/api/clubs', { method: 'POST', body: { name: `  ${name}  ` } });
  assert.equal(applied.status, 201, 'member applies');
  clubId = applied.data.id;
  assert.equal((await request('/api/clubs', { method: 'POST', body: { name } })).status, 409, 'duplicate name');
  assert.equal((await request('/api/clubs', { method: 'POST', body: { name: '' } })).status, 400, 'empty name');
  assert.ok(!(await request('/api/clubs')).data.clubs.some((c) => c.id === clubId), 'pending club is hidden');
  assert.equal((await request('/api/admin/clubs')).status, 403, 'member cannot list for review');
  const review = await request('/api/admin/clubs', { cookie: admin });
  const pending = review.data.clubs.find((c) => c.id === clubId);
  assert.equal(pending.status, 'pending');
  assert.equal(pending.name, name, 'name is trimmed');
  assert.equal(pending.requested_by_name, '두번째회원');

  // Task 3 assertions (club posts) are added below this line.

  const approve = { method: 'PATCH', body: { status: 'active' } };
  assert.equal((await request(`/api/admin/clubs/${clubId}`, approve)).status, 403, 'member cannot approve');
  assert.equal((await request(`/api/admin/clubs/${clubId}`, { ...approve, cookie: admin })).status, 200);
  assert.ok((await request('/api/clubs')).data.clubs.some((c) => c.id === clubId), 'approved club is listed');

  const other = await request('/api/clubs', { method: 'POST', body: { name: `${name}B` } });
  const rename = (to, id = clubId) =>
    request(`/api/admin/clubs/${id}`, { method: 'PATCH', body: { name: to }, cookie: admin });
  assert.equal((await rename(`${name}B`)).status, 409, 'rename onto an existing name');
  assert.equal((await rename(`${name}2`)).status, 200);
  assert.equal((await rename('x', 'missing')).status, 404);
  assert.equal(
    (await request(`/api/admin/clubs/${other.data.id}`, { method: 'DELETE', body: {}, cookie: admin })).status,
    200,
    'reject a pending request',
  );
  console.log('club tests passed');
} finally {
  for (const id of postIds) execute(`DELETE FROM posts WHERE id='${id}'`);
  execute(`DELETE FROM clubs WHERE name LIKE '${name}%'`);
  fixture.cleanup();
}
```

- [ ] **Step 2: 실패 확인**

Run: dev 서버 실행 상태에서 `node scripts/test-clubs.mjs`
Expected: FAIL — `/api/clubs` 404(라우트 없음)로 첫 assert 실패.

- [ ] **Step 3: `lib/clubs.ts`**

```ts
import { z } from 'zod';
import { db, HttpError } from './server';

export const clubNameField = z
  .string()
  .trim()
  .min(1, '동아리 이름을 입력해주세요.')
  .max(30, '동아리 이름은 30자 이내로 입력해주세요.');
// Club posts must name an approved club; posts on other boards never carry one.
export async function clubFor(category: string, clubId: string | null | undefined) {
  if (category !== 'clubs') return null;
  if (!clubId) throw new HttpError(400, '동아리를 선택해주세요.');
  const club = await db().prepare("SELECT id FROM clubs WHERE id=? AND status='active'").bind(clubId).first();
  if (!club) throw new HttpError(400, '승인된 동아리만 선택할 수 있습니다.');
  return clubId;
}
```

- [ ] **Step 4: `app/api/clubs/route.ts`**

```ts
import { z } from 'zod';
import { db, handle, HttpError, input, json, limit, requireMember } from '../../../lib/server';
import { clubNameField } from '../../../lib/clubs';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return handle(async () => {
    await requireMember(request);
    const rows = await db().prepare("SELECT id,name FROM clubs WHERE status='active' ORDER BY name").all();
    return json({ clubs: rows.results });
  });
}
// Any member may ask for a club; it stays hidden until an admin approves it.
export async function POST(request: Request) {
  return handle(async () => {
    const member = await requireMember(request);
    const { name } = z.object({ name: clubNameField }).parse(await input(request));
    await limit(request, 'club', 5, member.userId);
    const id = crypto.randomUUID();
    const result = await db()
      .prepare(
        "INSERT INTO clubs (id,name,status,requested_by,created_at) VALUES (?,?,'pending',?,?) ON CONFLICT(name) DO NOTHING",
      )
      .bind(id, name, member.userId, Date.now())
      .run();
    if (!result.meta.changes) throw new HttpError(409, '이미 있거나 신청된 동아리 이름입니다.');
    return json({ id }, 201);
  });
}
```

- [ ] **Step 5: `app/api/admin/clubs/route.ts`**

```ts
import { db, handle, json, requireAdmin } from '../../../../lib/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return handle(async () => {
    await requireAdmin(request);
    const rows = await db()
      .prepare(
        "SELECT clubs.id,clubs.name,clubs.status,clubs.created_at,users.display_name AS requested_by_name,(SELECT COUNT(*) FROM posts WHERE posts.club_id=clubs.id) AS post_count FROM clubs LEFT JOIN users ON users.id=clubs.requested_by ORDER BY (clubs.status='pending') DESC, clubs.name",
      )
      .all();
    return json({ clubs: rows.results });
  });
}
```

- [ ] **Step 6: `app/api/admin/clubs/[id]/route.ts`**

```ts
import { z } from 'zod';
import { db, handle, HttpError, input, json, requireAdmin } from '../../../../../lib/server';
import { clubNameField } from '../../../../../lib/clubs';

type Context = { params: Promise<{ id: string }> };
export const dynamic = 'force-dynamic';

// Admins approve a request or rename a club.
export async function PATCH(request: Request, context: Context) {
  return handle(async () => {
    await requireAdmin(request);
    const { id } = await context.params;
    const change = z
      .object({ status: z.literal('active').optional(), name: clubNameField.optional() })
      .refine((value) => value.status || value.name, '바꿀 내용을 선택해주세요.')
      .parse(await input(request));
    if (change.name) {
      const taken = await db().prepare('SELECT 1 FROM clubs WHERE name=? AND id<>?').bind(change.name, id).first();
      if (taken) throw new HttpError(409, '이미 있거나 신청된 동아리 이름입니다.');
    }
    const result = await db()
      .prepare('UPDATE clubs SET status=COALESCE(?,status),name=COALESCE(?,name) WHERE id=?')
      .bind(change.status ?? null, change.name ?? null, id)
      .run();
    if (!result.meta.changes) throw new HttpError(404, '동아리를 찾을 수 없습니다.');
    return json({ ok: true });
  });
}
// Rejects a pending request or removes a club. Clubs that still hold posts stay, so no post loses its club.
export async function DELETE(request: Request, context: Context) {
  return handle(async () => {
    await requireAdmin(request);
    await input(request); // same-origin check
    const { id } = await context.params;
    const used = await db().prepare('SELECT 1 FROM posts WHERE club_id=? LIMIT 1').bind(id).first();
    if (used) throw new HttpError(409, '글이 남아 있는 동아리는 삭제할 수 없습니다.');
    const result = await db().prepare('DELETE FROM clubs WHERE id=?').bind(id).run();
    if (!result.meta.changes) throw new HttpError(404, '동아리를 찾을 수 없습니다.');
    return json({ ok: true });
  });
}
```

- [ ] **Step 7: 통과 확인**

Run: `npx tsc --noEmit && node scripts/test-clubs.mjs`
Expected: `club tests passed`

- [ ] **Step 8: Commit**

```bash
git add lib/clubs.ts app/api/clubs app/api/admin/clubs scripts/test-clubs.mjs
git commit -m "Let members request clubs and admins approve, rename or remove them"
```

---

### Task 3: 글 API에 동아리 연결 (작성·수정·목록 필터·상세)

**Files:**
- Modify: `lib/server.ts` (`authorFields` 뒤 `clubField`, `createSchema`, `editSchema`, `PostRow`, `listColumns`, `visiblePost`, `publicPost`)
- Modify: `app/api/posts/route.ts` (GET 필터, POST 저장)
- Modify: `app/api/posts/[id]/route.ts` (PATCH 저장)
- Modify: `scripts/test-clubs.mjs`

**Interfaces:**
- Consumes: `clubFor` (Task 2).
- Produces: 목록 행에 `club_id: string|null`, `club_name: string|null`. 상세 `post.club_id`, `post.club_name`.
  `GET /api/posts?category=clubs&club=<id>` 필터. 글 작성·수정 body의 `club_id?: string|null`.

- [ ] **Step 1: 실패하는 테스트 추가** — `scripts/test-clubs.mjs`에서 `// Task 3 assertions ...` 줄을 아래로 바꾸고,
  승인 직후(`approved club is listed` assert 다음)에 두 번째 블록을 넣는다.

  승인 전 블록:

```js
  assert.equal((await post({})).status, 400, 'club posts need a club');
  assert.equal((await post({ club_id: clubId })).status, 400, 'pending club cannot take posts');
```

  승인 후 블록:

```js
  const created = await post({ club_id: clubId });
  assert.equal(created.status, 201, 'post into an approved club');
  postIds.push(created.data.id);
  const list = await request(`/api/posts?category=clubs&club=${clubId}`);
  assert.deepEqual(
    list.data.posts.map((p) => p.id),
    [created.data.id],
    'club tab lists only its posts',
  );
  assert.equal(list.data.posts[0].club_name, name);
  const detail = await request(`/api/posts/${created.data.id}`);
  assert.equal(detail.data.post.club_id, clubId);
  assert.equal(detail.data.post.club_name, name);
  const board = await request('/api/posts', {
    method: 'POST',
    body: { title: '자유', content: '본문', author_name: '별명', password, category: 'board', club_id: clubId },
  });
  postIds.push(board.data.id);
  assert.equal((await request(`/api/posts/${board.data.id}`)).data.post.club_id, null, 'other boards ignore club_id');
  const edit = (club_id) =>
    request(`/api/posts/${created.data.id}`, {
      method: 'PATCH',
      body: { title: '동아리 글', content: '수정', author_name: '별명', club_id },
    });
  assert.equal((await edit('missing')).status, 400, 'edit rejects an unknown club');
  assert.equal((await edit(undefined)).status, 200, 'edit without club_id keeps the club');
  assert.equal((await request(`/api/posts/${created.data.id}`)).data.post.club_id, clubId);
```

  이름 변경(`rename(\`${name}2\`)` 200) 다음에 추가:

```js
  assert.equal(
    (await request(`/api/posts?category=clubs&club=${clubId}`)).data.posts[0].club_name,
    `${name}2`,
    'renamed club follows its posts',
  );
  assert.equal(
    (await request(`/api/admin/clubs/${clubId}`, { method: 'DELETE', body: {}, cookie: admin })).status,
    409,
    'club with posts cannot be removed',
  );
```

- [ ] **Step 2: 실패 확인**

Run: `node scripts/test-clubs.mjs`
Expected: FAIL at `club posts need a club` (현재는 201).

- [ ] **Step 3: `lib/server.ts` 수정**

  `authorFields` 객체 정의 바로 뒤에 추가:

```ts
export const clubField = { club_id: z.string().trim().max(64).optional().nullable() };
```

  `createSchema`와 `editSchema`의 `...authorFields,` 다음 줄에 각각 `...clubField,` 추가.

  `PostRow`의 `prefix: string | null;` 다음에:

```ts
  club_id: string | null;
  club_name?: string | null;
```

  `listColumns`를 다음으로 교체:

```ts
export const listColumns =
  'id,title,category,prefix,club_id,author_name,status,recruitment_status,deadline,headcount,roles,resolved_at,pinned_at,created_at,updated_at,' +
  '(SELECT name FROM clubs WHERE clubs.id=posts.club_id) AS club_name,' +
  '(SELECT COUNT(*) FROM comments WHERE comments.post_id=posts.id) AS comment_count,' +
  '(SELECT COUNT(*) FROM images WHERE images.post_id=posts.id) AS image_count';
```

  `visiblePost` 첫 줄을 교체:

```ts
  const post = await db()
    .prepare('SELECT posts.*,clubs.name AS club_name FROM posts LEFT JOIN clubs ON clubs.id=posts.club_id WHERE posts.id=?')
    .bind(id)
    .first<PostRow>();
```

  `publicPost` 반환 객체의 `prefix: post.prefix,` 다음에:

```ts
    club_id: post.club_id,
    club_name: post.club_name ?? null,
```

- [ ] **Step 4: `app/api/posts/route.ts` 수정**

  import에 `import { clubFor } from '../../../lib/clubs';` 추가.

  GET의 "Open only" 블록 다음에:

```ts
    const club = url.searchParams.get('club');
    if (category === 'clubs' && club) {
      where.push('club_id=?');
      binds.push(club);
    }
```

  POST에서 `await checkImages(...)` 앞에 `const clubId = await clubFor(data.category, data.club_id);` 추가하고,
  INSERT를 다음으로 교체(`prefix` 뒤에 `club_id`):

```ts
    await db()
      .prepare(
        'INSERT INTO posts (id,category,title,content,password_hash,salt,status,recruitment_status,deadline,headcount,roles,author_id,author_name,prefix,club_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      )
      .bind(
        id,
        data.category,
        data.title,
        data.content,
        hash,
        salt,
        status,
        recruitmentStatus,
        deadline,
        headcount,
        roles,
        member.userId,
        data.author_name,
        data.prefix,
        clubId,
        now,
        now,
      )
      .run();
```

- [ ] **Step 5: `app/api/posts/[id]/route.ts` PATCH 수정**

  import에 `import { clubFor } from '../../../../lib/clubs';` 추가. `recruitmentValues` 줄 다음에:

```ts
    // Older club posts made before clubs existed may stay unassigned until someone picks one.
    const clubId =
      post.category === 'clubs' && !data.club_id && !post.club_id
        ? null
        : await clubFor(post.category, data.club_id || post.club_id);
```

  UPDATE를 교체:

```ts
    await db()
      .prepare(
        'UPDATE posts SET title=?,content=?,author_name=?,prefix=?,club_id=?,status=?,feedback=?,recruitment_status=?,deadline=?,headcount=?,roles=?,updated_at=? WHERE id=?',
      )
      .bind(
        data.title,
        data.content,
        data.author_name,
        data.prefix,
        clubId,
        status,
        feedback,
        recruitmentStatus,
        deadline,
        headcount,
        roles,
        Date.now(),
        id,
      )
      .run();
```

- [ ] **Step 6: 통과 확인 (새 테스트 + 기존 회귀)**

Run: `npx tsc --noEmit && node scripts/test-clubs.mjs && node scripts/test-api.mjs && node scripts/test-detail.mjs`
Expected: 모두 통과.

`scripts/test-api.mjs:37`의 게시판별 작성 루프는 `category:'clubs'` 글을 `club_id` 없이 만들어 400이 되므로 함께 고친다.
`const ids = {};` 다음 줄에:

```js
const testClub = `test-club-${suffix}`;
execute(`INSERT INTO clubs (id,name,status,created_at) VALUES ('${testClub}','검증동아리${suffix}','active',${Date.now()})`);
```

루프의 `recruitment` 객체에서 clubs 경우에 `club_id: testClub`을 넣는다:

```js
    const recruitment =
      category === 'clubs' || category === 'contests'
        ? {
            recruitment_status: 'open',
            deadline: '2026-12-31',
            headcount: 3,
            roles: '기획, 디자인',
            ...(category === 'clubs' ? { club_id: testClub } : {}),
          }
        : {};
```

파일 끝 `finally` 블록(823행 근처)의 `fixture.cleanup();` 앞에 `execute(\`DELETE FROM clubs WHERE id='${testClub}'\`);`를 넣는다
(글 삭제가 그보다 먼저 실행되는지 확인하고, 아니면 이 줄을 글 삭제 다음으로 옮긴다).

- [ ] **Step 7: Commit**

```bash
git add lib/server.ts app/api/posts scripts
git commit -m "Store, validate and filter club posts by club"
```

---

### Task 4: 동아리 게시판 화면 (칸 버튼·글쓰기 선택·개설 신청)

**Files:**
- Modify: `app/community.tsx`

**Interfaces:**
- Consumes: `GET/POST /api/clubs`, `GET /api/posts?club=`, 목록 행 `club_name`.

- [ ] **Step 1: 타입·상수** — `Post` 타입에 `club_name?: string | null;` 추가, 파일 위쪽에 `type Club = { id: string; name: string };`.
  `prefixHints.clubs`를 `'예: 신입 모집, 공지'`로 변경.

- [ ] **Step 2: 상태와 불러오기** — `openOnly` state 다음에:

```tsx
  const [clubs, setClubs] = useState<Club[]>([]);
  // The selected club tab lives in the URL (/clubs?club=<id>) so a tab can be shared.
  const [club, setClub] = useState(() =>
    typeof window !== 'undefined' && category === 'clubs'
      ? new URLSearchParams(window.location.search).get('club') || ''
      : '',
  );
```

  `load` 안 `if (recruiting && openOnly) ...` 다음에 `if (category === 'clubs' && club) params.set('club', club);`,
  의존성 배열에 `club` 추가.

  세션 불러오는 useEffect 다음에:

```tsx
  useEffect(() => {
    if (!identity.signedIn || (category !== 'clubs' && category !== 'all')) return;
    api<{ clubs: Club[] }>('/api/clubs')
      .then((data) => setClubs(data.clubs))
      .catch(() => setClubs([]));
  }, [category, identity.signedIn]);
```

  `openCreate` 앞에:

```tsx
  function selectClub(id: string) {
    setClub(id);
    window.history.replaceState(null, '', id ? `/clubs?club=${encodeURIComponent(id)}` : '/clubs');
  }
  async function applyClub() {
    const name = window.prompt('개설할 동아리 이름을 입력해주세요 (30자 이내)')?.trim();
    if (!name) return;
    try {
      await api('/api/clubs', { name });
      setNotice('동아리 개설을 신청했습니다. 관리자가 승인하면 칸이 생겨요.');
    } catch (e) {
      window.alert((e as Error).message);
    }
  }
```

- [ ] **Step 3: 칸 버튼 줄** — `{recruiting && ( ... 모집 상태 filter-row ... )}` 블록 다음에:

```tsx
            {category === 'clubs' && (
              <div className="filter-row" aria-label="동아리">
                {[{ id: '', name: '전체' }, ...clubs].map((item) => (
                  <button
                    key={item.id || 'all'}
                    className={club === item.id ? 'filter selected' : 'filter'}
                    aria-pressed={club === item.id}
                    onClick={() => selectClub(item.id)}
                  >
                    {item.name}
                  </button>
                ))}
                <button className="filter" onClick={() => void applyClub()}>
                  <Plus size={14} /> 동아리 개설 신청
                </button>
              </div>
            )}
```

- [ ] **Step 4: 목록 태그** — 글 행의 `<span className={\`category-tag ${post.category}\`}>{boardLabels[post.category]}</span>`를:

```tsx
                      <span className={`category-tag ${post.category}`}>
                        {boardLabels[post.category]}
                        {post.club_name && ` · ${post.club_name}`}
                      </span>
```

- [ ] **Step 5: 글쓰기 모달** — `<div className="form-grid">`(별명·머릿글) 바로 앞에:

```tsx
                {draftCategory === 'clubs' &&
                  (clubs.length ? (
                    <label>
                      동아리
                      <select name="club_id" required defaultValue={club}>
                        <option value="" disabled>
                          동아리를 선택해주세요
                        </option>
                        {clubs.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <p className="form-note">아직 승인된 동아리가 없어요. 동아리 게시판에서 먼저 개설을 신청해주세요.</p>
                  ))}
```

  `submit`의 `api('/api/posts', {...})` 객체에서 `...recruitment,` 다음에:

```tsx
        ...(formCategory === 'clubs' ? { club_id: form.get('club_id') || null } : {}),
```

- [ ] **Step 6: 확인**

Run: `npx tsc --noEmit && npm run lint`
Expected: 오류 없음.
브라우저(`preview_start({name:"web"})`)에서 관리자 fixture 쿠키로 `/clubs` 접속 → 칸 버튼 표시, 칸 클릭 시 주소 `?club=` 변경·목록 필터,
글쓰기 모달에 동아리 선택 미리 선택, 개설 신청 토스트 확인. 확인 뒤 만든 동아리·글·세션 삭제.

- [ ] **Step 7: Commit**

```bash
git add app/community.tsx
git commit -m "Split the clubs board into club tabs with a request button"
```

---

### Task 5: 글 상세 — 동아리 표시와 수정

**Files:**
- Modify: `app/posts/[id]/post-detail.tsx`

- [ ] **Step 1: 타입·상태** — `Post` 타입에 `club_id?: string | null; club_name?: string | null;` 추가.
  `uploading` state 다음에:

```tsx
  const [clubs, setClubs] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (mode !== 'edit' || post?.category !== 'clubs') return;
    api<{ clubs: { id: string; name: string }[] }>('/api/clubs')
      .then((data) => setClubs(data.clubs))
      .catch(() => setClubs([]));
  }, [mode, post?.category]);
```

- [ ] **Step 2: 표시** — 상세 머리의 `<span className={\`category-tag ${post.category}\`}>{boardLabels[post.category]}</span>`를:

```tsx
                <span className={`category-tag ${post.category}`}>
                  {boardLabels[post.category]}
                  {post.club_name && ` · ${post.club_name}`}
                </span>
```

- [ ] **Step 3: 수정 폼** — 수정 폼의 별명·머릿글 `<div className="form-grid">` 바로 앞에:

```tsx
                {post.category === 'clubs' && (
                  <label>
                    동아리
                    <select name="club_id" required={!!post.club_id} defaultValue={post.club_id || ''} key={clubs.length}>
                      {!post.club_id && <option value="">선택 안 함</option>}
                      {clubs.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
```

  (`key={clubs.length}`는 목록이 늦게 도착해도 `defaultValue`가 적용되도록 다시 그리게 한다.)

  `edit()`의 PATCH 본문에서 `...recruitment,` 다음에:

```tsx
          ...(post.category === 'clubs' ? { club_id: form.get('club_id') || null } : {}),
```

- [ ] **Step 4: 확인**

Run: `npx tsc --noEmit && npm run lint`
브라우저에서 동아리 글 상세 → "동아리 · 이름" 태그, 수정 → 동아리 바꾸기 저장 확인. 정리.

- [ ] **Step 5: Commit**

```bash
git add "app/posts/[id]/post-detail.tsx"
git commit -m "Show and change a post's club on the detail page"
```

---

### Task 6: 관리자 동아리 관리 화면

**Files:**
- Create: `app/admin/members/club-manager.tsx`
- Modify: `app/admin/members/member-manager.tsx` (변경 기록 `<details>` 다음, 닫는 `</section>` 앞에 `<ClubManager />`, import 추가)

**Interfaces:**
- Consumes: `GET /api/admin/clubs`, `PATCH|DELETE /api/admin/clubs/[id]`.

- [ ] **Step 1: 컴포넌트** — `app/admin/members/club-manager.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api-client';

type Club = {
  id: string;
  name: string;
  status: 'pending' | 'active';
  requested_by_name: string | null;
  post_count: number;
};

// Club requests from members: approve or reject them, and rename or remove approved clubs.
export default function ClubManager() {
  const [clubs, setClubs] = useState<Club[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      setClubs((await api<{ clubs: Club[] }>('/api/admin/clubs')).clubs);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  async function run(action: Promise<unknown>) {
    setError('');
    try {
      await action;
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function rename(club: Club) {
    const name = window.prompt('새 동아리 이름', club.name)?.trim();
    if (name && name !== club.name) void run(api(`/api/admin/clubs/${club.id}`, { name }, 'PATCH'));
  }
  function remove(club: Club) {
    const verb = club.status === 'pending' ? '거절' : '삭제';
    if (window.confirm(`${club.name} 동아리를 ${verb}할까요?`))
      void run(api(`/api/admin/clubs/${club.id}`, {}, 'DELETE'));
  }
  const pending = clubs?.filter((club) => club.status === 'pending').length ?? 0;
  return (
    <details className="member-audit" open={pending > 0}>
      <summary>
        동아리 관리 <span>{pending ? `대기 ${pending}` : (clubs?.length ?? 0)}</span>
      </summary>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!clubs ? (
        <p className="member-audit-empty">불러오는 중…</p>
      ) : clubs.length === 0 ? (
        <p className="member-audit-empty">아직 신청된 동아리가 없습니다.</p>
      ) : (
        <ol>
          {clubs.map((club) => (
            <li key={club.id}>
              <span>
                <strong>{club.name}</strong>{' '}
                <small>
                  {club.status === 'pending'
                    ? `승인 대기 · 신청 ${club.requested_by_name || '알 수 없음'}`
                    : `글 ${club.post_count}개`}
                </small>
              </span>
              <span className="approve-actions">
                {club.status === 'pending' ? (
                  <button
                    className="restore-button"
                    onClick={() => void run(api(`/api/admin/clubs/${club.id}`, { status: 'active' }, 'PATCH'))}
                  >
                    승인
                  </button>
                ) : (
                  <button className="secondary" onClick={() => rename(club)}>
                    이름 변경
                  </button>
                )}
                <button className="suspend-button" onClick={() => remove(club)}>
                  {club.status === 'pending' ? '거절' : '삭제'}
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}
```

- [ ] **Step 2: 붙이기** — `member-manager.tsx` 맨 위 import에 `import ClubManager from './club-manager';`,
  변경 기록 `</details>` 바로 다음 줄에 `<ClubManager />`.

- [ ] **Step 3: 확인**

Run: `npx tsc --noEmit && npm run lint`
브라우저 `/admin/members`에서 대기 신청 승인·거절, 이름 변경, 글 있는 동아리 삭제 시 오류 문구 확인. 스크린샷. 정리.

- [ ] **Step 4: Commit**

```bash
git add app/admin/members
git commit -m "Add club request review to the admin members page"
```

---

### Task 7: 도움말·인수인계 문서, 전체 검증

**Files:**
- Modify: `app/help/help-page.tsx`
- Modify: `docs/handoff.md`

- [ ] **Step 1: 도움말** — `help-page.tsx`
  - 게시판 표 `동아리 소개와 부원 모집` → `동아리별 칸에서 소개와 부원 모집`.
  - 머릿글 설명 `예: 동아리 게시판이면 동아리 이름, 학사문의면 “장학”·“휴학”.` → `예: 동아리 게시판이면 “신입 모집”, 학사문의면 “장학”·“휴학”.`
  - `<h3>동아리·공모전 모집 정보</h3>` 바로 앞에 새 소제목 추가:

```tsx
            <h3>동아리별 칸</h3>
            <p>
              동아리 게시판은 동아리마다 칸이 나뉘어 있습니다. 위쪽 동아리 이름을 누르면 그 동아리 글만 보이고, 글을 쓸
              때는 <strong>동아리</strong>를 꼭 골라야 합니다. 원하는 동아리가 없으면 <strong>동아리 개설 신청</strong>
              버튼으로 이름을 보내 주세요. 관리자가 승인하면 칸이 생깁니다.
            </p>
```

- [ ] **Step 2: 인수인계** — `docs/handoff.md`
  - §3 `db/schema.ts` 줄의 테이블 목록에 `clubs` 추가, `drizzle/` 줄 `0000~0010` → `0000~0011`.
  - §2 공개 게시판 항목 다음에: `- **동아리 칸**: 회원이 신청(`/api/clubs`)하고 관리자가 회원·직책 관리 화면 아래에서 승인합니다. 동아리 글은 `posts.club_id`로 연결되며, 글이 남은 동아리는 삭제할 수 없습니다.`
  - §3 `lib/` 목록에 `clubs.ts` 추가.

- [ ] **Step 3: 전체 검증**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Run (dev 서버 켠 상태): `for f in scripts/test-*.mjs; do case $f in *fixture*|*sites-env*) ;; *) node "$f" || exit 1;; esac; done`
Expected: 모두 통과. 확인용으로 만든 회원·글·동아리·세션이 남지 않았는지 `SELECT COUNT(*) FROM clubs`로 확인.

- [ ] **Step 4: Commit**

```bash
git add app/help/help-page.tsx docs/handoff.md
git commit -m "Document club tabs in the help page and handoff notes"
```

## 뺀 것 (나중에)

- 관리자 알림 벨에 동아리 신청 표시 — 지금은 회원·직책 관리 화면의 "동아리 관리" 칸에서 확인. 신청이 잦아지면 `alertsSql`에 `club` 종류 추가.
- 동아리 소개글·회장 권한 — 요청대로 제외.
