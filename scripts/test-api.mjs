import assert from 'node:assert/strict';
import { createMemberFixture, execute } from './test-member-fixture.mjs';
const base = 'http://localhost:5173';
const password = 'Test-only-1234';
const adminCode = 'Local-admin-code-1234';
const fixture = await createMemberFixture();
const admin = fixture.activeCookie,
  author = fixture.secondCookie;
async function request(path, { method = 'GET', body, cookie = author } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json', Origin: base } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { status: res.status, data };
}
const suffix = Date.now();
const ids = {};
try {
  assert.equal((await request('/api/posts', { cookie: '' })).status, 401, 'anonymous list is denied');
  assert.equal(
    (
      await request('/api/posts', {
        method: 'POST',
        cookie: '',
        body: { title: 'x', content: 'x', author_name: 'x', password, category: 'board' },
      })
    ).status,
    401,
    'anonymous create is denied',
  );

  for (const category of ['board', 'clubs', 'contests', 'news']) {
    const recruitment =
      category === 'clubs' || category === 'contests'
        ? { recruitment_status: 'open', deadline: '2026-12-31', headcount: 3, roles: '기획, 디자인' }
        : {};
    const r = await request('/api/posts', {
      method: 'POST',
      body: {
        title: `검증 ${category} ${suffix}`,
        content: '본문 테스트 <script>alert(1)</script>',
        category,
        author_name: '작성자',
        prefix: `${category}머릿글`,
        password,
        ...recruitment,
      },
    });
    assert.equal(r.status, 201);
    assert.equal(r.data.status, category === 'news' ? 'pending' : 'published');
    ids[category] = r.data.id;
  }
  assert.equal(
    (await request('/api/posts', { method: 'POST', body: { title: 'x', content: 'x', category: 'board', password } }))
      .status,
    400,
    'author name is required',
  );

  // Before joining as admin, the first member is an ordinary reader.
  let list = await request('/api/posts', { cookie: admin });
  assert.equal(list.status, 200);
  assert.equal(
    list.data.posts.some((x) => x.id === ids.news),
    false,
    'combined board never lists news',
  );
  const board = list.data.posts.find((x) => x.id === ids.board);
  assert.equal(board.prefix, 'board머릿글', 'prefix listed');
  assert.equal(board.author_name, '작성자', 'author name listed');
  assert.equal(JSON.stringify(list.data).includes('본문 테스트'), false, 'list does not include bodies');
  assert.equal(JSON.stringify(list.data).includes('password_hash'), false, 'hash not leaked');
  const contest = list.data.posts.find((x) => x.id === ids.contests);
  assert.equal(contest.recruitment_status, 'open');
  assert.equal(contest.deadline, '2026-12-31');
  assert.equal(contest.headcount, 3);
  assert.equal(contest.roles, '기획, 디자인');
  assert.equal(
    (await request('/api/posts?category=news', { cookie: admin })).data.posts.length,
    0,
    'news tab lists only own articles',
  );
  assert.equal(
    (await request(`/api/posts/${ids.news}`, { cookie: admin })).status,
    404,
    'other members cannot open news',
  );
  const read = await request(`/api/posts/${ids.board}`, { cookie: admin });
  assert.equal(read.status, 200);
  assert.equal(
    read.data.post.content,
    '본문 테스트 <script>alert(1)</script>',
    'members read bodies without a password',
  );
  assert.equal('password_hash' in read.data.post, false);

  const mine = await request('/api/posts?category=news');
  assert.deepEqual(
    mine.data.posts.map((x) => [x.id, x.status]),
    [[ids.news, 'pending']],
    'author sees own pending news',
  );

  assert.equal(
    (
      await request(`/api/posts/${ids.board}`, {
        method: 'PATCH',
        cookie: admin,
        body: { title: '변경', content: '변경', author_name: 'x', password: 'incorrect-pass' },
      })
    ).status,
    403,
    'wrong password blocks edit',
  );
  assert.equal(
    (
      await request(`/api/posts/${ids.board}`, {
        method: 'PATCH',
        cookie: admin,
        body: { title: '변경', content: '변경', author_name: 'x' },
      })
    ).status,
    400,
    'non-admin edit needs a password',
  );
  assert.equal((await request(`/api/posts/${ids.board}`)).data.post.mine, true, 'author sees the post as theirs');
  assert.equal((await request(`/api/posts/${ids.board}`, { cookie: admin })).data.post.mine, false);
  assert.equal(
    (
      await request(`/api/posts/${ids.board}`, {
        method: 'PATCH',
        body: { title: `검증 board ${suffix}`, content: '작성자 수정', author_name: '작성자' },
      })
    ).status,
    200,
    'the signed-in author edits without a password',
  );
  assert.equal(
    (
      await request(`/api/posts/${ids.board}`, {
        method: 'DELETE',
        cookie: admin,
        body: { password: 'incorrect-pass' },
      })
    ).status,
    403,
    'wrong password blocks delete',
  );
  assert.equal(
    (
      await request(`/api/posts/${ids.board}`, {
        method: 'PATCH',
        body: { title: '수정 검증', content: '수정한 본문', author_name: '새이름', prefix: '', password },
      })
    ).status,
    200,
  );
  const edited = (await request(`/api/posts/${ids.board}`)).data.post;
  assert.equal(edited.content, '수정한 본문');
  assert.equal(edited.author_name, '새이름');
  assert.equal(edited.prefix, null, 'empty prefix clears it');
  assert.equal(
    (
      await request(`/api/posts/${ids.contests}`, {
        method: 'PATCH',
        body: {
          title: '모집 수정',
          content: '수정한 모집',
          author_name: '작성자',
          password,
          recruitment_status: 'closed',
          deadline: '2027-01-15',
          headcount: 4,
          roles: '영상, 개발',
        },
      })
    ).status,
    200,
  );
  const recruit = (await request(`/api/posts/${ids.contests}`)).data.post;
  assert.equal(recruit.recruitment_status, 'closed');
  assert.equal(recruit.headcount, 4);
  assert.equal(recruit.roles, '영상, 개발');
  assert.equal(
    (
      await request(`/api/posts/${ids.contests}`, {
        method: 'PATCH',
        body: { title: '모집 수정', content: '수정한 모집', author_name: '작성자', password, headcount: 2 },
      })
    ).status,
    200,
    'recruitment fields are optional',
  );
  const partial = (await request(`/api/posts/${ids.contests}`)).data.post;
  assert.equal(partial.headcount, 2);
  assert.equal(partial.recruitment_status, null);
  assert.equal(partial.deadline, null);

  assert.equal((await request('/api/admin/posts')).status, 403, 'non-admin cannot open the review queue');
  assert.equal(
    (await request(`/api/admin/posts/${ids.news}`, { method: 'PATCH', body: { action: 'approve', updated_at: 0 } }))
      .status,
    403,
  );
  if (!(await request('/api/session', { cookie: admin })).data.admin)
    assert.equal(
      (await request('/api/admin/join', { method: 'POST', cookie: admin, body: { code: adminCode } })).status,
      201,
      'local test account registers with the admin code',
    );
  assert.equal((await request(`/api/posts/${ids.news}`, { cookie: admin })).status, 200, 'admin can open any news');

  // 31 rejected articles with one shared timestamp: pages must split on the id tie-breaker without gaps.
  const pageIds = Array.from({ length: 31 }, (_, i) => `page-test-${String(i).padStart(2, '0')}`);
  execute(
    `INSERT INTO posts (id,category,title,content,password_hash,salt,status,author_name,created_at,updated_at) VALUES ${pageIds
      .map((id) => `('${id}','news','페이지','본문','x','x','rejected','기자',1,1)`)
      .join(',')}`,
  );
  try {
    const seen = [];
    let cursor = '',
      pages = 0,
      total = 0;
    do {
      const page = await request(`/api/admin/posts?status=rejected${cursor ? `&cursor=${cursor}` : ''}`, {
        cookie: admin,
      });
      assert.ok(page.data.posts.length <= 30, 'review pages hold at most 30 articles');
      seen.push(...page.data.posts.map((x) => x.id));
      total = page.data.total;
      cursor = page.data.nextCursor;
      pages++;
    } while (cursor);
    assert.ok(pages >= 2, 'more than 30 articles span pages');
    assert.equal(new Set(seen).size, seen.length, 'no article repeats across pages');
    assert.equal(seen.length, total, 'every article is reachable and matches the total');
    assert.ok(
      pageIds.every((id) => seen.includes(id)),
      'no tied article is skipped',
    );
  } finally {
    execute(`DELETE FROM posts WHERE id LIKE 'page-test-%'`);
  }

  const pending = async () =>
    (await request('/api/admin/posts?status=pending', { cookie: admin })).data.posts.find((x) => x.id === ids.news);
  let news = await pending();
  assert.ok(news, 'news waits in the pending tab');
  assert.equal(
    (
      await request(`/api/admin/posts/${ids.news}`, {
        method: 'PATCH',
        cookie: admin,
        body: {
          action: 'edit',
          title: '관리자 검토',
          content: '관리자가 다듬은 기사 본문',
          prefix: '행사',
          updated_at: news.updated_at,
        },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(`/api/admin/posts/${ids.news}`, {
        method: 'PATCH',
        cookie: admin,
        body: { action: 'approve', updated_at: news.updated_at },
      })
    ).status,
    409,
    'stale review blocked',
  );
  news = await pending();
  assert.equal(
    (
      await request(`/api/admin/posts/${ids.news}`, {
        method: 'PATCH',
        cookie: admin,
        body: {
          action: 'feedback',
          note: '',
          marks: [{ start: 0, end: 999, type: 'bold' }],
          updated_at: news.updated_at,
        },
      })
    ).status,
    400,
    'marks must stay inside the body',
  );
  assert.equal(
    (
      await request(`/api/admin/posts/${ids.news}`, {
        method: 'PATCH',
        cookie: admin,
        body: {
          action: 'feedback',
          note: '',
          marks: [{ start: 0, end: 3, type: 'memo' }],
          updated_at: news.updated_at,
        },
      })
    ).status,
    400,
    'memo marks need text',
  );
  const marks = [
    { start: 0, end: 3, type: 'highlight' },
    { start: 4, end: 7, type: 'memo', memo: '근거 보완' },
  ];
  assert.equal(
    (
      await request(`/api/admin/posts/${ids.news}`, {
        method: 'PATCH',
        cookie: admin,
        body: { action: 'feedback', note: '보완해주세요', marks, updated_at: news.updated_at },
      })
    ).status,
    200,
  );
  let authored = (await request(`/api/posts/${ids.news}`)).data.post;
  assert.equal(authored.status, 'feedback');
  assert.equal(authored.feedback.note, '보완해주세요');
  assert.deepEqual(authored.feedback.marks, marks, 'author receives feedback marks');
  assert.equal(
    (
      await request(`/api/posts/${ids.news}`, {
        method: 'PATCH',
        body: { title: '다시 제출', content: '보완한 본문', author_name: '작성자', password },
      })
    ).data.status,
    'pending',
    'resubmission returns to pending',
  );
  authored = (await request(`/api/posts/${ids.news}`)).data.post;
  assert.equal(authored.feedback, null, 'resubmission clears feedback');

  news = await pending();
  assert.equal(
    (
      await request(`/api/admin/posts/${ids.news}`, {
        method: 'PATCH',
        cookie: admin,
        body: { action: 'reject', note: '', updated_at: news.updated_at },
      })
    ).status,
    400,
    'rejection needs a reason',
  );
  assert.equal(
    (
      await request(`/api/admin/posts/${ids.news}`, {
        method: 'PATCH',
        cookie: admin,
        body: { action: 'reject', note: '주제 불일치', updated_at: news.updated_at },
      })
    ).status,
    200,
  );
  assert.equal((await request(`/api/posts/${ids.news}`)).data.post.feedback.note, '주제 불일치');
  assert.equal(
    (
      await request(`/api/posts/${ids.news}`, {
        method: 'PATCH',
        body: { title: 'x', content: 'x', author_name: 'x', password },
      })
    ).status,
    409,
    'rejected news cannot be edited by its author',
  );
  const reviewedAt = (await request('/api/session')).data.newsReviewedAt;
  assert.ok(reviewedAt >= news.updated_at, 'session reports when the author last received a review result');
  assert.equal((await request('/api/session', { cookie: admin })).data.newsReviewedAt, null, 'no reviews for admin');

  const searched = await request(`/api/posts?q=${encodeURIComponent('clubs머릿글')}`, { cookie: admin });
  assert.deepEqual(
    searched.data.posts.map((x) => x.id),
    [ids.clubs],
    'search matches prefixes on the server',
  );
  assert.equal(
    (await request('/api/posts?q=%25', { cookie: admin })).data.posts.length,
    0,
    'LIKE wildcards are escaped',
  );
  const byBody = await request(`/api/posts?q=${encodeURIComponent('본문 테스트')}`, { cookie: admin });
  assert.deepEqual(
    byBody.data.posts.map((x) => x.id),
    [ids.clubs],
    'search matches bodies but never private news',
  );
  assert.match(byBody.data.posts[0].snippet, /본문 테스트/, 'body matches return an excerpt');
  assert.equal('content' in byBody.data.posts[0], false, 'search results still omit full bodies');
  assert.deepEqual(
    (await request(`/api/posts?q=${encodeURIComponent('새이름')}`, { cookie: admin })).data.posts.map((x) => x.id),
    [ids.board],
    'search matches author names',
  );

  const comments = (cookie = admin) => request(`/api/posts/${ids.board}/comments`, { cookie });
  assert.deepEqual((await comments()).data.comments, [], 'new posts have no comments');
  const myComment = await request(`/api/posts/${ids.board}/comments`, {
    method: 'POST',
    body: { author_name: '댓글러', content: '첫 댓글' },
  });
  assert.equal(myComment.status, 201);
  assert.equal(myComment.data.comment.deletable, true);
  assert.equal(
    (await request(`/api/posts/${ids.board}/comments`, { method: 'POST', body: { content: '이름 없음' } })).status,
    400,
    'comment author name is required',
  );
  assert.equal(
    (
      await request(`/api/posts/${ids.news}/comments`, {
        method: 'POST',
        body: { author_name: 'x', content: 'x' },
      })
    ).status,
    400,
    'news cannot be commented on',
  );
  const adminComment = await request(`/api/posts/${ids.board}/comments`, {
    method: 'POST',
    cookie: admin,
    body: { author_name: '운영진', content: '관리자 댓글' },
  });
  const seenByAuthor = (await comments(author)).data.comments;
  assert.deepEqual(
    seenByAuthor.map((c) => [c.content, c.deletable]),
    [
      ['첫 댓글', true],
      ['관리자 댓글', false],
    ],
    'comments are oldest first and only the writer (or an admin) may delete',
  );
  assert.equal('author_id' in seenByAuthor[0], false, 'author ids are not exposed');
  assert.equal(
    (await request(`/api/comments/${adminComment.data.comment.id}`, { method: 'DELETE', body: {} })).status,
    403,
    "members cannot delete others' comments",
  );
  const counted = (await request('/api/posts?category=board', { cookie: admin })).data.posts.find(
    (x) => x.id === ids.board,
  );
  assert.equal(counted.comment_count, 2, 'lists show comment counts');
  assert.equal(
    (await request(`/api/comments/${myComment.data.comment.id}`, { method: 'DELETE', cookie: admin, body: {} })).status,
    200,
    'admins delete any comment',
  );
  assert.equal((await comments()).data.comments.length, 1);
  // Insert page fixtures directly: the API allows 10 posts per member per minute. Same created_at on
  // several rows exercises the id tie-breaker in the cursor.
  const bulk = Array.from({ length: 31 }, (_, i) => `page-${suffix}-${String(i).padStart(2, '0')}`);
  execute(
    bulk
      .map(
        (id, i) =>
          `INSERT INTO posts (id,category,title,content,password_hash,salt,status,author_id,author_name,created_at,updated_at) VALUES ('${id}','board','페이지 ${suffix} ${i}','페이지','x','x','published','test-member-second','페이지',${suffix - (i % 3)},${suffix})`,
      )
      .join('; '),
  );
  Object.assign(ids, Object.fromEntries(bulk.map((id) => [id, id])));
  const page1 = await request(`/api/posts?category=board&q=${encodeURIComponent(`페이지 ${suffix}`)}`, {
    cookie: admin,
  });
  assert.equal(page1.data.posts.length, 30, 'first page holds 30 posts');
  assert.ok(page1.data.nextCursor, 'a cursor points to the next page');
  const page2 = await request(
    `/api/posts?category=board&q=${encodeURIComponent(`페이지 ${suffix}`)}&cursor=${page1.data.nextCursor}`,
    { cookie: admin },
  );
  assert.equal(page2.data.posts.length, 1, 'second page holds the rest');
  assert.equal(page2.data.nextCursor, null);
  assert.equal(
    new Set([...page1.data.posts, ...page2.data.posts].map((x) => x.id)).size,
    31,
    'pages do not overlap or skip',
  );

  const second = await request('/api/posts', {
    method: 'POST',
    body: { title: `승인 검증 ${suffix}`, content: '승인될 기사', category: 'news', author_name: '작성자', password },
  });
  ids.news2 = second.data.id;
  news = (await request('/api/admin/posts?status=pending', { cookie: admin })).data.posts.find(
    (x) => x.id === ids.news2,
  );
  assert.equal(
    (
      await request(`/api/admin/posts/${ids.news2}`, {
        method: 'PATCH',
        cookie: admin,
        body: { action: 'approve', updated_at: news.updated_at },
      })
    ).status,
    200,
  );
  const tabs = Object.fromEntries(
    await Promise.all(
      ['rejected', 'published'].map(async (s) => [
        s,
        (await request(`/api/admin/posts?status=${s}`, { cookie: admin })).data.posts.map((x) => x.id),
      ]),
    ),
  );
  assert.ok(tabs.rejected.includes(ids.news));
  assert.ok(tabs.published.includes(ids.news2));
  assert.equal(
    (await request('/api/posts', { cookie: admin })).data.posts.some((x) => x.id === ids.news2),
    false,
    'approved news stays private',
  );

  assert.equal(
    (await request(`/api/posts/${ids.clubs}`, { method: 'DELETE', cookie: admin, body: {} })).status,
    200,
    'admin deletes without a password',
  );
  delete ids.clubs;
  assert.equal(
    (
      await request('/api/posts', {
        method: 'POST',
        body: { title: ' ', content: 'x', author_name: 'x', password, category: 'board' },
      })
    ).status,
    400,
  );
  const cross = await fetch(base + '/api/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://untrusted.example', Cookie: author },
    body: JSON.stringify({ title: 'x', content: 'x', author_name: 'x', password, category: 'board' }),
  });
  assert.equal(cross.status, 403);
} finally {
  for (const id of Object.values(ids))
    await request(`/api/posts/${id}`, { method: 'DELETE', cookie: admin, body: {} }).catch(() => {});
  fixture.cleanup();
}
console.log(
  'PASS: open reading, authors and prefixes, private news, password-checked edit/delete, admin edit/feedback/reject/approve, stale review, resubmission, validation, cross-origin rejection. Test posts removed.',
);
