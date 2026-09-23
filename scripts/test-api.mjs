import assert from 'node:assert/strict';
import { createMemberFixture, execute, setRole } from './test-member-fixture.mjs';
const base = 'http://localhost:5173';
const password = 'Test-only-1234';
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
execute('DELETE FROM attempts'); // runs back to back would otherwise share rate-limit windows
const ids = {};
const testClub = `test-club-${suffix}`;
execute(`INSERT INTO clubs (id,name,status,created_at) VALUES ('${testClub}','검증동아리${suffix}','active',${Date.now()})`);
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
        ? {
            recruitment_status: 'open',
            deadline: '2026-12-31',
            headcount: 3,
            roles: '기획, 디자인',
            ...(category === 'clubs' ? { club_id: testClub } : {}),
          }
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
        images: [],
        ...recruitment,
      },
    });
    assert.equal(r.status, 201, 'posts without photos save cleanly (the form always sends images: [])');
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
  assert.equal('writer' in read.data.post, false, 'members see the nickname, never the account behind it');

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
        body: { title: `검증 board ${suffix}`, content: '작성자 수정', author_name: '작성자', images: [] },
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

  // "Open only": open with a future or no deadline; past-deadline, closed and unset posts drop out.
  const openCases = {
    past: "'open','2020-01-01'",
    future: "'open','2999-12-31'",
    undated: "'open',NULL",
    closed: "'closed',NULL",
    unset: 'NULL,NULL',
  };
  execute(
    `INSERT INTO posts (id,category,title,content,password_hash,salt,status,recruitment_status,deadline,author_name,created_at,updated_at) VALUES ${Object.entries(
      openCases,
    )
      .map(([name, values]) => `('open-test-${name}','contests','x','x','x','x','published',${values},'x',1,1)`)
      .join(',')}`,
  );
  try {
    const listed = async (query) =>
      (await request(`/api/posts?category=contests${query}`)).data.posts
        .map((x) => x.id)
        .filter((id) => id.startsWith('open-test-'))
        .sort();
    assert.deepEqual(await listed('&open=1'), ['open-test-future', 'open-test-undated'], 'open filter');
    assert.equal((await listed('')).length, 5, 'without the filter every post is listed');
  } finally {
    execute(`DELETE FROM posts WHERE id LIKE 'open-test-%'`);
  }

  // Desks (1:1 inquiries, complaints): only the writer (and admins) can see them; the combined board skips them.
  for (const desk of ['inquiry', 'complaint']) {
    const created = await request('/api/posts', {
      method: 'POST',
      body: { title: `${desk} ${suffix}`, content: '비공개 내용', category: desk, author_name: '작성자', password },
    });
    assert.equal(created.status, 201, `${desk} is created`);
    ids[desk] = created.data.id;
    assert.equal(
      (await request(`/api/posts/${ids[desk]}`, { cookie: admin })).status,
      404,
      `others cannot open ${desk}`,
    );
    assert.equal(
      (await request(`/api/posts?category=${desk}`, { cookie: admin })).data.posts.length,
      0,
      `others' ${desk} posts are not listed`,
    );
    assert.ok(
      (await request(`/api/posts?category=${desk}`)).data.posts.some((x) => x.id === ids[desk]),
      `the writer lists their ${desk}`,
    );
    assert.equal(
      (await request('/api/posts')).data.posts.some((x) => x.id === ids[desk]),
      false,
      `the combined board skips ${desk}`,
    );
  }
  assert.equal(
    (await request(`/api/posts/${ids.board}/flags`, { method: 'POST', body: { pinned: true } })).status,
    403,
    'members cannot pin',
  );
  assert.equal((await request('/api/posts?category=qna')).status, 400, 'the Q&A board is gone');

  assert.equal((await request('/api/admin/posts')).status, 403, 'non-admin cannot open the review queue');
  assert.equal(
    (await request(`/api/admin/posts/${ids.news}`, { method: 'PATCH', body: { action: 'approve', updated_at: 0 } }))
      .status,
    403,
  );
  // Admins see the account behind a nickname on posts and comments.
  setRole('test-member-active', 'admin');
  const adminRead = (await request(`/api/posts/${ids.board}`, { cookie: admin })).data.post;
  assert.equal(adminRead.writer?.email, 'second@ks.ac.kr', 'admins see who wrote a post');
  // A 학사 member handles inquiries only: no suggestions, no news review.
  setRole('test-member-active', 'academic');
  assert.equal(
    (await request(`/api/posts/${ids.inquiry}`, { cookie: admin })).data.post.writer?.email,
    'second@ks.ac.kr',
    '학사 sees who asked an inquiry',
  );
  assert.equal(
    'writer' in (await request(`/api/posts/${ids.board}`, { cookie: admin })).data.post,
    false,
    'staff do not see writers outside their desk',
  );
  assert.equal((await request(`/api/posts/${ids.inquiry}`, { cookie: admin })).status, 200, '학사 opens inquiries');
  assert.equal(
    (await request(`/api/posts/${ids.complaint}`, { cookie: admin })).status,
    404,
    '학사 cannot open suggestions',
  );
  assert.equal((await request('/api/admin/posts', { cookie: admin })).status, 403, '학사 cannot review news');
  assert.deepEqual((await request('/api/session', { cookie: admin })).data.role, 'academic');
  const staffReply = await request(`/api/posts/${ids.inquiry}/comments`, {
    method: 'POST',
    cookie: admin,
    body: { author_name: '학과사무실', content: '확인 중입니다.' },
  });
  assert.equal(staffReply.data.comment.role, 'academic', 'staff comments carry a badge');
  assert.ok((await request(`/api/posts/${ids.inquiry}`)).data.post.resolved_at, 'a 학사 reply answers the inquiry');
  assert.equal(
    (await request(`/api/posts/${ids.inquiry}/comments`)).data.comments.find((c) => c.id === staffReply.data.comment.id)
      .role,
    'academic',
    'the asker sees the badge',
  );
  await request(`/api/posts/${ids.inquiry}/comments`, {
    method: 'POST',
    body: { author_name: '작성자', content: '감사합니다. 하나 더 여쭤볼게요.' },
  });
  const staffBell = (await request('/api/notifications', { cookie: admin })).data.replies;
  assert.ok(
    staffBell.some((r) => r.kind === 'desk' && r.post_id === ids.inquiry),
    '학사 is alerted to new inquiries',
  );
  assert.ok(
    staffBell.some((r) => r.kind === 'followup' && r.post_id === ids.inquiry),
    "학사 is alerted to the asker's follow-up",
  );
  assert.equal(
    staffBell.some((r) => r.post_id === ids.complaint),
    false,
    '학사 gets no suggestion alerts',
  );
  // A 학생회 member handles suggestions only.
  setRole('test-member-active', 'council');
  assert.equal(
    (await request(`/api/posts/${ids.complaint}`, { cookie: admin })).status,
    200,
    '학생회 opens suggestions',
  );
  assert.equal(
    (await request(`/api/posts/${ids.inquiry}`, { cookie: admin })).status,
    404,
    '학생회 cannot open inquiries',
  );
  assert.deepEqual(Object.keys((await request('/api/session', { cookie: admin })).data.waiting), ['complaint']);
  setRole('test-member-active', 'admin');
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

  // Admin pins an older board post: it leads the first page once and is not repeated on later pages.
  const pinnedId = ids.board;
  assert.equal(
    (await request(`/api/posts/${pinnedId}/flags`, { method: 'POST', cookie: admin, body: { pinned: true } })).status,
    200,
    'admins pin posts',
  );
  const newer = await request('/api/posts', {
    method: 'POST',
    body: { title: `최신 ${suffix}`, content: 'x', category: 'board', author_name: 'x', password },
  });
  const firstPage = (await request('/api/posts?category=board')).data.posts;
  assert.equal(firstPage[0].id, pinnedId, 'pinned post comes first');
  assert.equal(firstPage.filter((x) => x.id === pinnedId).length, 1, 'pinned post appears once');
  assert.equal(
    (await request(`/api/posts/${ids.news}/flags`, { method: 'POST', cookie: admin, body: { pinned: true } })).status,
    400,
    'news cannot be pinned',
  );
  await request(`/api/posts/${pinnedId}/flags`, { method: 'POST', cookie: admin, body: { pinned: false } });
  assert.notEqual((await request('/api/posts?category=board')).data.posts[0].id, pinnedId, 'unpinning restores order');
  await request(`/api/posts/${newer.data.id}`, { method: 'DELETE', body: {} });

  // Admins list every desk post; an admin reply answers it and the writer's follow-up reopens it.
  for (const desk of ['inquiry', 'complaint']) {
    assert.ok(
      (await request(`/api/posts?category=${desk}`, { cookie: admin })).data.posts.some((x) => x.id === ids[desk]),
      `admins list all ${desk} posts`,
    );
    const waiting = async () => (await request('/api/session', { cookie: admin })).data.waiting[desk] || 0;
    const waitingBefore = await waiting();
    assert.ok(waitingBefore >= 1, `admins see the ${desk} waiting count`);
    const reply = (cookie, content) =>
      request(`/api/posts/${ids[desk]}/comments`, { method: 'POST', cookie, body: { author_name: '담당자', content } });
    await reply(admin, '확인했습니다.');
    assert.ok((await request(`/api/posts/${ids[desk]}`)).data.post.resolved_at, `an admin reply answers the ${desk}`);
    assert.equal(await waiting(), waitingBefore - 1);
    await reply(author, '추가 문의입니다.');
    assert.equal((await request(`/api/posts/${ids[desk]}`)).data.post.resolved_at, null, 'a follow-up reopens it');
    assert.equal(
      (await request(`/api/posts/${ids[desk]}/flags`, { method: 'POST', cookie: admin, body: { pinned: true } }))
        .status,
      400,
      `${desk} posts cannot be pinned`,
    );
  }

  // Photos: uploads stay private to the uploader until a post claims them; then they follow the post's visibility.
  execute('DELETE FROM attempts');
  // A minimal WebP header: "RIFF", size, "WEBP". The server checks the header matches the declared type.
  const webp = new Uint8Array([82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80]);
  const upload = (type = 'image/webp', cookie = author, bytes = webp) =>
    fetch(`${base}/api/images`, {
      method: 'POST',
      headers: { 'Content-Type': type, Origin: base, Cookie: cookie },
      body: bytes,
    }).then(async (r) => ({ status: r.status, data: await r.json() }));
  const image = (key, cookie = author) =>
    fetch(`${base}/api/images/${key}`, { headers: { Cookie: cookie } }).then((r) => r.status);
  assert.equal((await upload('text/html')).status, 415, 'only photos upload');
  assert.equal(
    (await upload('image/webp', author, new TextEncoder().encode('<html>not a photo</html>'))).status,
    415,
    'a file merely labelled as a photo is rejected',
  );
  const [a, b, c] = [(await upload()).data.key, (await upload()).data.key, (await upload()).data.key];
  assert.equal(await image(a), 200, 'the uploader sees an unattached photo');
  assert.equal(await image(a, admin), 404, 'others cannot see an unattached photo');
  const titled = `사진실패 ${suffix}`;
  assert.equal(
    (
      await request('/api/posts', {
        method: 'POST',
        body: { title: titled, content: 'x', category: 'board', author_name: 'x', password, images: [a, a] },
      })
    ).status,
    400,
    'a duplicated photo list is rejected',
  );
  assert.equal(
    (await request(`/api/posts?category=board&q=${encodeURIComponent(titled)}`)).data.posts.length,
    0,
    'a rejected photo list saves no post',
  );
  const withPhotos = await request('/api/posts', {
    method: 'POST',
    body: { title: `사진 ${suffix}`, content: 'x', category: 'board', author_name: 'x', password, images: [a, b] },
  });
  assert.equal(withPhotos.status, 201);
  assert.deepEqual((await request(`/api/posts/${withPhotos.data.id}`)).data.post.images, [a, b], 'photos keep order');
  assert.equal(await image(a, admin), 200, 'members see photos of a public post');
  assert.equal(
    (await request('/api/posts?category=board')).data.posts.find((x) => x.id === withPhotos.data.id).image_count,
    2,
    'lists show photo counts',
  );
  const adminPhoto = (await upload('image/webp', admin)).data.key;
  assert.equal(
    (
      await request(`/api/posts/${withPhotos.data.id}`, {
        method: 'PATCH',
        body: { title: 'x', content: 'x', author_name: 'x', images: [a, adminPhoto] },
      })
    ).status,
    400,
    "another member's upload cannot be claimed",
  );
  await request(`/api/posts/${withPhotos.data.id}`, {
    method: 'PATCH',
    body: { title: 'x', content: 'x', author_name: 'x', images: [b] },
  });
  assert.deepEqual((await request(`/api/posts/${withPhotos.data.id}`)).data.post.images, [b]);
  assert.equal(await image(a), 404, 'a photo dropped in an edit is deleted');
  const privatePhoto = await request('/api/posts', {
    method: 'POST',
    body: { title: 'x', content: 'x', category: 'inquiry', author_name: 'x', password, images: [c] },
  });
  assert.equal(await image(c, fixture.expiredCookie), 401);
  assert.equal(await image(c), 200, 'the asker sees their inquiry photo');
  await request(`/api/posts/${privatePhoto.data.id}`, { method: 'DELETE', body: {} });
  assert.equal(await image(c), 404, 'deleting a post deletes its photos');
  await request(`/api/posts/${withPhotos.data.id}`, { method: 'DELETE', body: {} });
  assert.equal(await image(b), 404);
  execute(`DELETE FROM images WHERE key='${adminPhoto}'`);
  // Uploads left unattached for over a day are swept on the next upload.
  execute(
    `INSERT INTO images (key,owner_id,post_id,position,created_at) VALUES ('00000000-0000-0000-0000-00000000dead.webp','test-member-second',NULL,0,1)`,
  );
  const sweeper = (await upload()).data.key;
  assert.equal(await image('00000000-0000-0000-0000-00000000dead.webp'), 404, 'stale uploads are swept');
  execute(`DELETE FROM images WHERE key='${sweeper}'`);

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
  assert.equal('writer' in seenByAuthor[0], false, 'members do not see who wrote comments');
  assert.deepEqual(
    (await comments(admin)).data.comments.map((c) => c.writer?.email),
    ['second@ks.ac.kr', 'active@ks.ac.kr'],
    'admins see who wrote each comment',
  );
  const replies = (await request('/api/notifications')).data.replies.filter((r) => r.post_id === ids.board);
  assert.deepEqual(
    replies.map((r) => [r.excerpt, r.author_name]),
    [['관리자 댓글', '운영진']],
    "the author's bell lists others' comments, not their own",
  );
  assert.equal(
    (await request('/api/session')).data.repliedAt,
    adminComment.data.comment.created_at,
    'the session carries the latest reply time for the bell dot',
  );
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

  // This test writes more than the per-minute post limit allows; start a fresh window.
  execute('DELETE FROM attempts');
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
  execute(`DELETE FROM clubs WHERE id='${testClub}'`);
  fixture.cleanup();
}
console.log(
  'PASS: open reading, authors and prefixes, private news, password-checked edit/delete, admin edit/feedback/reject/approve, stale review, resubmission, validation, cross-origin rejection. Test posts removed.',
);
