'use client';

import { recruitmentState } from '../lib/recruitment';
import { ImagePicker } from './image-picker';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronRight,
  CircleHelp,
  FileText,
  Image as ImageIcon,
  Megaphone,
  Inbox,
  LockKeyhole,
  MessageSquare,
  Newspaper,
  Plus,
  Search,
  ShieldCheck,
  Trophy,
  UserCog,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { statusLabels } from './annotated-article';
import ReviewWorkspace from './admin/review-workspace';
import { api } from './api-client';
import {
  AppShell,
  boardLabels,
  deskStatus,
  boardPaths,
  boards,
  markSeen,
  seenAt,
  type BoardId,
  type ShellIdentity,
} from './app-shell';

type WritableBoard = Exclude<BoardId, 'all'>;
type Club = { id: string; name: string };
type Post = {
  id: string;
  title: string;
  category: WritableBoard;
  created_at: number;
  updated_at: number;
  status?: string;
  prefix?: string | null;
  author_name?: string | null;
  recruitment_status?: 'open' | 'closed' | null;
  deadline?: string | null;
  headcount?: number | null;
  comment_count?: number;
  image_count?: number;
  snippet?: string | null;
  resolved_at?: number | null;
  pinned_at?: number | null;
  club_name?: string | null;
};
type Identity = ShellIdentity & { admin: boolean };
const prefixHints: Record<WritableBoard, string> = {
  board: '예: 질문, 정보',
  inquiry: '예: 장학, 휴학',
  complaint: '예: 시설, 행사',
  news: '예: 행사, 인터뷰',
  clubs: '예: 신입 모집, 공지',
  contests: '예: 공모전 이름',
};
const formatDate = (n: number) => new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit' }).format(n);

export default function Community({ category = 'all', admin = false }: { category?: BoardId; admin?: boolean }) {
  const [identity, setIdentity] = useState<Identity>({
    admin: false,
    signedIn: false,
    loaded: false,
  });
  const [posts, setPosts] = useState<Post[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [openOnly, setOpenOnly] = useState(false);
  const [clubs, setClubs] = useState<Club[]>([]);
  // The selected club tab lives in the URL (/clubs?club=<id>) so a tab can be shared.
  const [club, setClub] = useState(() =>
    typeof window !== 'undefined' && category === 'clubs'
      ? new URLSearchParams(window.location.search).get('club') || ''
      : '',
  );
  const recruiting = category === 'clubs' || category === 'contests';
  const [newsSeenBefore, setNewsSeenBefore] = useState(0);
  const [notice, setNotice] = useState('');
  const [creating, setCreating] = useState(false);
  const [modalError, setModalError] = useState('');
  const [busy, setBusy] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [draftCategory, setDraftCategory] = useState<WritableBoard>(category === 'all' ? 'board' : category);
  const dialog = useRef<HTMLDialogElement>(null);
  const loadId = useRef(0);
  const current = boards.find((board) => board.id === category) || boards[0];

  const load = useCallback(
    async (cursor?: string) => {
      const id = ++loadId.current;
      const params = new URLSearchParams();
      if (category !== 'all') params.set('category', category);
      if (search) params.set('q', search);
      if (recruiting && openOnly) params.set('open', '1');
      if (category === 'clubs' && club) params.set('club', club);
      if (cursor) params.set('cursor', cursor);
      if (cursor) setLoadingMore(true);
      else {
        setLoading(true);
        setPosts([]);
      }
      setError('');
      try {
        const data = await api<{ posts: Post[]; nextCursor: string | null }>(`/api/posts?${params}`);
        if (id !== loadId.current) return;
        setPosts((list) => (cursor ? [...list, ...data.posts] : data.posts));
        setNextCursor(data.nextCursor);
      } catch (e) {
        if (id === loadId.current) setError((e as Error).message);
      } finally {
        if (id === loadId.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [category, search, recruiting, openOnly, club],
  );

  useEffect(() => {
    api<Omit<Identity, 'loaded'>>('/api/session')
      .then((data) => setIdentity({ ...data, loaded: true }))
      .catch(() => setIdentity((value) => ({ ...value, loaded: true })));
  }, []);
  useEffect(() => {
    if (!identity.signedIn || (category !== 'clubs' && category !== 'all')) return;
    api<{ clubs: Club[] }>('/api/clubs')
      .then((data) => setClubs(data.clubs))
      .catch(() => setClubs([]));
  }, [category, identity.signedIn]);
  useEffect(() => {
    if (admin || !identity.loaded || !identity.signedIn) return;
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [admin, identity.loaded, identity.signedIn, load]);
  // Search runs on the server once typing pauses.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);
  // Opening the news tab marks review results as seen; remember the previous time to badge what is new.
  useEffect(() => {
    if (category !== 'news' || !identity.userId) return;
    const userId = identity.userId;
    const timer = setTimeout(() => {
      setNewsSeenBefore(seenAt('news', userId));
      markSeen('news', userId);
    }, 0);
    return () => clearTimeout(timer);
  }, [category, identity.userId]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 5500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (creating) dialog.current?.showModal();
    else dialog.current?.close();
  }, [creating]);

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
  function openCreate() {
    setModalError('');
    setDraftCategory(category === 'all' ? 'board' : category);
    setImages([]);
    setCreating(true);
  }
  function closeCreate() {
    if (busy) return;
    setCreating(false);
    setModalError('');
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setModalError('');
    const form = new FormData(event.currentTarget);
    const formCategory = String(form.get('category')) as WritableBoard;
    const recruitment =
      formCategory === 'clubs' || formCategory === 'contests'
        ? {
            recruitment_status: form.get('recruitment_status') || null,
            deadline: form.get('deadline') || null,
            headcount: form.get('headcount') ? Number(form.get('headcount')) : null,
            roles: String(form.get('roles') || '').trim() || null,
          }
        : {};
    try {
      await api('/api/posts', {
        title: form.get('title'),
        content: form.get('content'),
        category: formCategory,
        author_name: form.get('author_name'),
        prefix: form.get('prefix'),
        images,
        password: form.get('password'),
        ...recruitment,
        ...(formCategory === 'clubs' ? { club_id: form.get('club_id') || null } : {}),
      });
      setNotice(
        formCategory === 'news'
          ? '기사를 제출했습니다. 뉴스 탭에서 검토 결과를 확인할 수 있어요.'
          : '게시글을 등록했습니다.',
      );
      setCreating(false);
      await load();
    } catch (e) {
      setModalError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const title = admin ? '뉴스 승인' : current.label;
  const feedTitle = category === 'all' ? '전체 게시글' : category === 'news' ? '내 기사' : current.label;
  return (
    <AppShell
      active={admin ? 'admin' : category}
      identity={identity}
      breadcrumb={
        <>
          라운지 <ChevronRight size={14} /> <b>{title}</b>
        </>
      }
    >
      <section className="page-heading">
        <div>
          <p className="eyebrow">{admin ? 'NEWS REVIEW' : 'THE COMMUNITY'}</p>
          <h1>
            {title}
            <span className="heading-dot">.</span>
          </h1>
          <p>{admin ? '제출된 기사를 검토하고 승인, 피드백 또는 반려해주세요.' : current.sub}</p>
        </div>
        {admin && identity.admin && (
          <a className="heading-link" href="/admin/members">
            <UserCog size={18} />
            회원·직책 관리
            {!!identity.pendingMembers && (
              <span className="heading-count" aria-label={`승인 대기 ${identity.pendingMembers}명`}>
                {identity.pendingMembers}
              </span>
            )}
          </a>
        )}
        {!admin && identity.signedIn && (
          <button className="primary" onClick={openCreate}>
            <Plus size={19} />
            {category === 'news' ? '기사 제출하기' : category === 'inquiry' ? '문의하기' : '글 작성하기'}
          </button>
        )}
      </section>
      {!admin && category === 'all' && (
        <section className="welcome-panel">
          <div>
            <span className="tiny-label">HELLO, MICOM!</span>
            <h2>
              우리의 다음 이야기는
              <br />
              <span>여기서 시작됩니다.</span>
            </h2>
            <p>새로운 소식, 같은 관심사, 함께할 사람들.</p>
            <button onClick={openCreate}>
              첫 이야기를 꺼내보세요 <ArrowUpRight size={18} />
            </button>
          </div>
          <div className="orbit-art" aria-hidden="true">
            <div className="orbit one" />
            <div className="orbit two" />
            <div className="orbit-center">
              m<span>✳</span>
            </div>
            <span className="orbit-badge badge-news">
              <Newspaper size={24} />
            </span>
            <span className="orbit-badge badge-people">
              <Users size={25} />
            </span>
            <span className="orbit-badge badge-star">✳</span>
            <span className="orbit-label">BETTER TOGETHER</span>
          </div>
        </section>
      )}

      {!identity.loaded ? (
        <div className="loading" role="status">
          계정 정보를 확인하고 있습니다…
        </div>
      ) : admin ? (
        identity.admin ? (
          <ReviewWorkspace onNotice={setNotice} />
        ) : (
          <div className="admin-gate">
            <ShieldCheck size={32} />
            <h3>관리자 전용 공간입니다</h3>
            <p>
              {identity.signedIn
                ? '관리자 직책이 필요합니다. 관리자에게 직책을 요청해주세요.'
                : '로그인한 뒤 이용할 수 있습니다.'}
            </p>
            {!identity.signedIn && (
              <a className="primary" href="/login?returnTo=/admin">
                로그인 <ArrowRight size={16} />
              </a>
            )}
          </div>
        )
      ) : !identity.signedIn ? (
        <section className="member-gate">
          <div className="member-gate-icon">
            <LockKeyhole size={29} />
          </div>
          <p className="eyebrow">SCHOOL MEMBERS ONLY</p>
          <h2>학교 이메일 인증 후 이용할 수 있어요</h2>
          <p>누구나 미컴 라운지를 방문할 수 있지만, 게시글 열람과 작성은 인증을 마친 학과 구성원에게만 제공됩니다.</p>
          <div>
            <a className="primary" href={`/login?returnTo=${encodeURIComponent(boardPaths[category])}`}>
              로그인 <ArrowRight size={17} />
            </a>
            <a className="secondary" href="/signup">
              회원가입
            </a>
          </div>
          <small>@ks.ac.kr 이메일이 필요합니다.</small>
        </section>
      ) : (
        <div className="content-grid">
          <section className="feed">
            <div className="feed-header">
              <h2>
                {feedTitle}
                <span>{loading ? '—' : `${posts.length}${nextCursor ? '+' : ''}`}</span>
              </h2>
              <span className="sort-label">
                최신순 <ArrowDown size={14} />
              </span>
            </div>
            <div className="search-row">
              <Search size={18} />
              <input
                aria-label="제목 검색"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="제목·본문·작성자로 검색"
              />
            </div>
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
                <button className="filter club-apply" onClick={() => void applyClub()}>
                  <Plus size={14} /> 동아리 개설 신청
                </button>
              </div>
            )}
            {recruiting && (
              <div className="filter-row" aria-label="모집 상태">
                {[false, true].map((value) => (
                  <button
                    key={String(value)}
                    className={openOnly === value ? 'filter selected' : 'filter'}
                    aria-pressed={openOnly === value}
                    onClick={() => setOpenOnly(value)}
                  >
                    {value ? '모집 중만' : '모든 글'}
                  </button>
                ))}
              </div>
            )}
            {category === 'all' && (
              <div className="filter-row" aria-label="게시글 분류">
                {boards
                  .filter((board) => board.id !== 'news' && !deskStatus[board.id])
                  .map((board) => (
                    <a key={board.id} className={board.id === 'all' ? 'filter selected' : 'filter'} href={board.href}>
                      {board.id === 'all' ? '전체' : board.label}
                    </a>
                  ))}
              </div>
            )}
            {error && (
              <div className="error-box" role="alert">
                {error}
                <button onClick={() => void load()}>다시 시도</button>
              </div>
            )}
            {loading ? (
              <div className="loading" role="status">
                게시글을 불러오는 중입니다…
              </div>
            ) : error ? null : posts.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <FileText size={28} />
                </div>
                <h3>
                  {search
                    ? '검색 결과가 없습니다'
                    : category === 'news'
                      ? '아직 제출한 기사가 없어요'
                      : '아직 올라온 이야기가 없어요'}
                </h3>
                <p>
                  {search
                    ? '다른 검색어로 다시 찾아보세요.'
                    : category === 'news'
                      ? '기사를 제출하면 검토 결과를 이곳에서 확인할 수 있어요.'
                      : '첫 번째 글로 우리 학과의 이야기를 시작해보세요.'}
                </p>
                {!search && (
                  <button className="text-button" onClick={openCreate}>
                    {category === 'news'
                      ? '첫 기사 제출하기'
                      : category === 'inquiry'
                        ? '문의 남기기'
                        : '첫 글 작성하기'}{' '}
                    <ArrowRight size={16} />
                  </button>
                )}
              </div>
            ) : (
              <div className="post-list">
                {posts.map((post) => (
                  <a className="post-row" key={post.id} href={`/posts/${post.id}`}>
                    <div className={`category-symbol ${post.category}`}>
                      {post.category === 'news' ? (
                        <Newspaper size={21} />
                      ) : post.category === 'clubs' ? (
                        <Users size={21} />
                      ) : post.category === 'contests' ? (
                        <Trophy size={21} />
                      ) : post.category === 'inquiry' ? (
                        <Inbox size={21} />
                      ) : post.category === 'complaint' ? (
                        <Megaphone size={21} />
                      ) : (
                        <FileText size={21} />
                      )}
                    </div>
                    <div className="post-info">
                      <span className={`category-tag ${post.category}`}>
                        {boardLabels[post.category]}
                        {post.club_name && ` · ${post.club_name}`}
                      </span>
                      {post.pinned_at && <span className="status-badge feedback">고정</span>}
                      {deskStatus[post.category] && (
                        <span className={`status-badge ${post.resolved_at ? 'published' : 'pending'}`}>
                          {deskStatus[post.category]?.[post.resolved_at ? 1 : 0]}
                        </span>
                      )}
                      {category === 'news' && post.status && (
                        <span className={`status-badge ${post.status}`}>{statusLabels[post.status]}</span>
                      )}
                      {category === 'news' && post.status !== 'pending' && post.updated_at > newsSeenBefore && (
                        <span className="new-badge">새 결과</span>
                      )}
                      <h3>
                        {post.prefix && <span className="post-prefix">[{post.prefix}]</span>}
                        {post.title}
                      </h3>
                      {(post.recruitment_status || post.deadline || post.headcount) && (
                        <div className="recruitment-line">
                          {recruitmentState(post.recruitment_status, post.deadline) && (
                            <span
                              className={`recruitment-status ${recruitmentState(post.recruitment_status, post.deadline)}`}
                            >
                              {recruitmentState(post.recruitment_status, post.deadline) === 'open' ? '모집 중' : '마감'}
                            </span>
                          )}
                          {post.deadline && (
                            <span>
                              <CalendarDays size={13} />
                              {post.deadline}
                            </span>
                          )}
                          {post.headcount && (
                            <span>
                              <UserRound size={13} />
                              {post.headcount}명
                            </span>
                          )}
                        </div>
                      )}
                      {post.snippet && <p className="post-snippet">{post.snippet}</p>}
                      <div className="post-meta">
                        {post.author_name || '이름 없음'}
                        <span>·</span>
                        {formatDate(post.created_at)}
                        {!!post.comment_count && (
                          <span className="comment-count">
                            <MessageSquare size={12} />
                            {post.comment_count}
                          </span>
                        )}
                        {!!post.image_count && (
                          <span className="comment-count" aria-label={`사진 ${post.image_count}장`}>
                            <ImageIcon size={12} />
                            {post.image_count}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="row-arrow" size={19} />
                  </a>
                ))}
              </div>
            )}
            {nextCursor && !loading && (
              <button className="load-more" disabled={loadingMore} onClick={() => void load(nextCursor)}>
                {loadingMore ? '불러오는 중…' : '더 보기'}
              </button>
            )}
            <div className="feed-foot">
              <LockKeyhole size={14} />{' '}
              {category === 'news'
                ? '학과 뉴스는 작성자와 관리자만 볼 수 있습니다.'
                : deskStatus[category]
                  ? `${current.label}는 작성한 사람과 ${category === 'inquiry' ? '학사 담당자' : '학생회'}만 볼 수 있습니다.`
                  : '학교 인증을 마친 회원만 게시글을 볼 수 있습니다.'}
            </div>
          </section>
          <aside className="right-rail">
            <section className="guide-card">
              <div className="card-kicker">
                <CircleHelp size={17} />
                라운지 이용 안내
              </div>
              <h3>
                함께 읽고,
                <br />
                함께 나누는 공간.
              </h3>
              <p>
                인증을 마친 학과 구성원은
                <br />
                모든 게시글을 읽을 수 있어요.
              </p>
              <div className="guide-separator" />
              <div className="guide-item">
                <span>01</span>
                <div>
                  <strong>내 글은 바로 수정해요</strong>
                  <p>작성한 계정으로는 비밀번호 없이 수정·삭제할 수 있어요.</p>
                </div>
              </div>
              <div className="guide-item">
                <span>02</span>
                <div>
                  <strong>뉴스는 검토 후 승인돼요</strong>
                  <p>결과는 뉴스 탭의 내 기사에서 확인해요.</p>
                </div>
              </div>
            </section>
            <section className="connect-card">
              <div className="connect-icon">
                <Trophy size={23} />
              </div>
              <h3>혼자보다 함께</h3>
              <p>
                다음 공모전,
                <br />
                함께 도전할 팀원을 찾아보세요.
              </p>
              <a href="/contests">
                공모전 모집 보기 <ArrowUpRight size={17} />
              </a>
            </section>
          </aside>
        </div>
      )}

      {notice && (
        <div className="toast" role="status">
          <Check size={18} />
          {notice}
        </div>
      )}
      <dialog
        ref={dialog}
        aria-label="게시글 작성"
        onCancel={(e) => {
          e.preventDefault();
          closeCreate();
        }}
        onClick={(e) => {
          if (e.target === dialog.current) closeCreate();
        }}
        className="post-dialog"
      >
        <div className="dialog-inner">
          <button className="dialog-close icon-button" aria-label="닫기" disabled={busy} onClick={closeCreate}>
            <X size={21} />
          </button>
          {creating && (
            <>
              <p className="eyebrow">WRITE A STORY</p>
              <h2>
                {draftCategory === 'news'
                  ? '기사 제출'
                  : draftCategory === 'inquiry'
                    ? '1:1 학사문의'
                    : '새로운 이야기'}
              </h2>
              <form onSubmit={submit}>
                {category !== 'all' ? (
                  <>
                    <input type="hidden" name="category" value={category} />
                    <p className="form-note">{boardLabels[category]} 게시판에 작성합니다.</p>
                  </>
                ) : (
                  <label>
                    게시할 공간
                    <select
                      name="category"
                      value={draftCategory}
                      onChange={(e) => setDraftCategory(e.target.value as WritableBoard)}
                    >
                      <option value="board">자유게시판</option>
                      <option value="inquiry">학사문의 · 1:1 비공개</option>
                      <option value="complaint">학생회 건의 · 비공개</option>
                      <option value="news">학과 뉴스 · 관리자 검토</option>
                      <option value="clubs">동아리</option>
                      <option value="contests">공모전 모집</option>
                    </select>
                  </label>
                )}
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
                <div className="form-grid">
                  <label>
                    별명
                    <input name="author_name" required maxLength={20} placeholder="글에 표시될 별명" />
                    <small className="field-hint">실명이 아니어도 돼요. 실제 계정은 관리자만 볼 수 있어요.</small>
                  </label>
                  <label>
                    머릿글 <small className="inline-optional">선택</small>
                    <input name="prefix" maxLength={30} placeholder={prefixHints[draftCategory]} />
                  </label>
                </div>
                <label>
                  제목
                  <input name="title" required maxLength={120} placeholder="어떤 이야기를 나누고 싶나요?" />
                </label>
                <label>
                  본문
                  <textarea
                    name="content"
                    required
                    maxLength={20000}
                    rows={8}
                    placeholder="소식이나 모집 내용을 자유롭게 작성해주세요."
                  />
                </label>
                <ImagePicker value={images} onChange={setImages} onBusy={setUploading} />
                {(draftCategory === 'clubs' || draftCategory === 'contests') && (
                  <fieldset className="recruitment-fields">
                    <legend>모집 정보 (선택)</legend>
                    <div className="form-grid">
                      <label>
                        모집 상태
                        <select name="recruitment_status" defaultValue="">
                          <option value="">선택 안 함</option>
                          <option value="open">모집 중</option>
                          <option value="closed">마감</option>
                        </select>
                      </label>
                      <label>
                        모집 마감일
                        <input name="deadline" type="date" />
                      </label>
                      <label>
                        모집 인원
                        <input name="headcount" type="number" min="1" max="99" placeholder="예: 3" />
                      </label>
                      <label>
                        필요한 역할
                        <input name="roles" maxLength={200} placeholder="예: 기획, 디자인, 개발" />
                      </label>
                    </div>
                  </fieldset>
                )}
                <label>
                  수정·삭제 비밀번호
                  <input
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    maxLength={128}
                    autoComplete="new-password"
                    placeholder="8자 이상 입력해주세요"
                  />
                  <small>내 계정에서는 없이 수정·삭제할 수 있고, 다른 계정에서 관리할 때 필요해요.</small>
                </label>
                {draftCategory === 'news' && (
                  <p className="form-note">
                    기사는 나와 관리자만 볼 수 있고, 검토 결과는 뉴스 탭에서 확인할 수 있어요.
                  </p>
                )}
                {modalError && (
                  <p className="form-error" role="alert">
                    {modalError}
                  </p>
                )}
                <button className="primary full" disabled={busy || uploading}>
                  {busy ? '저장 중…' : draftCategory === 'news' ? '기사 제출' : '작성 완료'}
                  <ArrowRight size={17} />
                </button>
              </form>
            </>
          )}
        </div>
      </dialog>
    </AppShell>
  );
}
