'use client';

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
  Layers3,
  LockKeyhole,
  LogOut,
  Menu,
  MessageSquare,
  Newspaper,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { statusLabels } from './annotated-article';
import ReviewWorkspace from './admin/review-workspace';

type Category = 'all' | 'board' | 'news' | 'clubs' | 'contests';
type Post = {
  id: string;
  title: string;
  category: Exclude<Category, 'all'>;
  created_at: number;
  updated_at?: number;
  content?: string;
  status?: string;
  prefix?: string | null;
  author_name?: string | null;
  recruitment_status?: 'open' | 'closed' | null;
  deadline?: string | null;
  headcount?: number | null;
  roles?: string | null;
};
type Identity = {
  admin: boolean;
  signedIn: boolean;
  configured: boolean;
  loaded: boolean;
  userId?: string;
  email?: string;
  displayName?: string;
};
const tabs = [
  { id: 'all', label: '통합 게시판', icon: Layers3, sub: '학과의 모든 이야기를 한곳에서 만나보세요.' },
  { id: 'board', label: '자유게시판', icon: MessageSquare, sub: '하고 싶은 이야기를 편하게 나눠보세요.' },
  { id: 'news', label: '학과 뉴스', icon: Newspaper, sub: '기사를 제출하고 검토 결과를 확인하세요.' },
  { id: 'clubs', label: '동아리', icon: Users, sub: '같은 관심사로 시작하는 새로운 연결.' },
  { id: 'contests', label: '공모전 모집', icon: Trophy, sub: '아이디어를 함께 완성할 팀원을 만나보세요.' },
] as const;
const labels: Record<string, string> = {
  board: '자유게시판',
  news: '학과 뉴스',
  clubs: '동아리',
  contests: '공모전 모집',
};
const paths: Record<string, string> = {
  all: '/',
  board: '/board',
  news: '/news',
  clubs: '/clubs',
  contests: '/contests',
};
const prefixHints: Record<string, string> = {
  board: '예: 질문, 정보',
  news: '예: 행사, 인터뷰',
  clubs: '예: 동아리 이름',
  contests: '예: 공모전 이름',
};
const formatDate = (n: number) => new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit' }).format(n);
async function api<T = Record<string, unknown>>(path: string, body?: unknown, method = 'POST'): Promise<T> {
  const response = await fetch(
    path,
    body
      ? { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : { cache: 'no-store' },
  );
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || '요청을 처리하지 못했습니다. 다시 시도해주세요.');
  return data;
}

export default function Community({ category = 'all', admin = false }: { category?: Category; admin?: boolean }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [identity, setIdentity] = useState<Identity>({
    admin: false,
    signedIn: false,
    configured: false,
    loaded: false,
  });
  const [notice, setNotice] = useState('');
  const [mode, setMode] = useState<'create' | null>(null);
  const [modalError, setModalError] = useState('');
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [query, setQuery] = useState('');
  const [draftCategory, setDraftCategory] = useState<Exclude<Category, 'all'>>(category === 'all' ? 'board' : category);
  const current = tabs.find((t) => t.id === category) || tabs[0];
  const loadId = useRef(0);
  const load = useCallback(async () => {
    const id = ++loadId.current;
    setLoading(true);
    setError('');
    setPosts([]);
    try {
      const data = await api<{ posts: Post[] }>(category === 'all' ? '/api/posts' : `/api/posts?category=${category}`);
      if (id === loadId.current) setPosts(data.posts);
    } catch (e) {
      if (id === loadId.current) setError((e as Error).message);
    } finally {
      if (id === loadId.current) setLoading(false);
    }
  }, [category]);
  useEffect(() => {
    if (admin || !identity.loaded || !identity.signedIn) return;
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [admin, identity.admin, identity.loaded, identity.signedIn, load]);
  useEffect(() => {
    api<Omit<Identity, 'loaded'>>('/api/session')
      .then((data) => setIdentity({ ...data, loaded: true }))
      .catch(() => setIdentity((current) => ({ ...current, loaded: true })));
  }, []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 5500);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    if (mode) {
      dialog.current?.showModal();
    } else dialog.current?.close();
  }, [mode]);
  useEffect(() => {
    const registry = (
      document as Document & { modelContext?: { registerTool: (tool: unknown, options: unknown) => void } }
    ).modelContext;
    if (!registry) return;
    const controller = new AbortController();
    try {
      registry.registerTool(
        {
          name: 'open_community_tab',
          description: '통합 게시판, 자유게시판, 뉴스, 동아리 또는 공모전 모집의 별도 게시판 페이지로 이동합니다.',
          inputSchema: {
            type: 'object',
            properties: { category: { type: 'string', enum: ['all', 'board', 'news', 'clubs', 'contests'] } },
            required: ['category'],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false },
          execute: (input: { category: string }) => {
            if (!['all', 'board', 'news', 'clubs', 'contests'].includes(input.category))
              throw Error('지원하지 않는 탭입니다.');
            window.location.assign(paths[input.category]);
            return { navigatingTo: paths[input.category] };
          },
        },
        { signal: controller.signal },
      );
    } catch {}
    return () => controller.abort();
  }, []);
  function open() {
    setModalError('');
    setDraftCategory(category === 'all' ? 'board' : category);
    setMode('create');
  }
  function close() {
    if (!busy) {
      setMode(null);
      setModalError('');
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setModalError('');
    const form = new FormData(event.currentTarget);
    try {
      {
        const formCategory = String(form.get('category')) as Exclude<Category, 'all'>;
        const recruitment =
          formCategory === 'clubs' || formCategory === 'contests'
            ? {
                recruitment_status: form.get('recruitment_status'),
                deadline: form.get('deadline'),
                headcount: Number(form.get('headcount')),
                roles: form.get('roles'),
              }
            : {};
        await api('/api/posts', {
          title: form.get('title'),
          content: form.get('content'),
          category: formCategory,
          author_name: form.get('author_name'),
          prefix: form.get('prefix'),
          password: form.get('password'),
          ...recruitment,
        });
        setNotice(
          formCategory === 'news'
            ? '기사를 제출했습니다. 뉴스 탭에서 검토 결과를 확인할 수 있어요.'
            : '게시글을 등록했습니다.',
        );
        setMode(null);
        await load();
      }
    } catch (e) {
      setModalError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    try {
      await api('/api/auth/session', {}, 'DELETE');
      window.location.assign('/');
    } catch (e) {
      setNotice((e as Error).message);
      setBusy(false);
    }
  }
  const normalizedQuery = query.trim().toLocaleLowerCase('ko-KR');
  const visible = posts.filter(
    (p) =>
      (category === 'all' || p.category === category) &&
      (!normalizedQuery || `${p.prefix || ''} ${p.title}`.toLocaleLowerCase('ko-KR').includes(normalizedQuery)),
  );
  const feedTitle = category === 'all' ? '전체 게시글' : category === 'news' ? '내 기사' : current.label;
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'mobile-open' : ''}`}>
        <a className="brand" href="/" aria-label="미컴 라운지 홈">
          <span className="brand-mark">
            m<span>·</span>
          </span>
          <span>
            미컴<span className="brand-light">라운지</span>
            <small>OUR CAMPUS, CONNECTED</small>
          </span>
        </a>
        <div className="workspace">
          <span className="workspace-icon">
            <Users size={20} />
          </span>
          <div>
            학과 커뮤니티<small>함께 만드는 우리 공간</small>
          </div>
          <span className="online-dot" />
        </div>
        <p className="nav-caption">커뮤니티</p>
        <nav aria-label="주요 메뉴">
          {tabs.map((t) => (
            <a
              key={t.id}
              href={paths[t.id]}
              aria-current={!admin && category === t.id ? 'page' : undefined}
              className={!admin && category === t.id ? 'nav-item active' : 'nav-item'}
            >
              <t.icon size={20} />
              {t.label}
              {!admin && category === t.id && <span className="nav-dot" />}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Sparkles size={19} />
            <strong>작은 이야기가 연결이 되는 곳</strong>
            <p>
              우리 학과의 소식과 관심사를
              <br />
              함께 나눠보세요.
            </p>
          </div>
          <a href="/admin" aria-current={admin ? 'page' : undefined} className={`nav-item ${admin ? 'active' : ''}`}>
            <ShieldCheck size={20} />
            뉴스 승인
            <ArrowUpRight size={16} />
          </a>
          <div className="sidebar-footer">
            MICOM LOUNGE <span>© {new Date().getFullYear()}</span>
          </div>
        </div>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <div>
            <button className="icon-button mobile-menu" aria-label="메뉴 열기" onClick={() => setMobileNav(!mobileNav)}>
              <Menu size={22} />
            </button>
            <span className="breadcrumb">
              라운지 <ChevronRight size={14} /> <b>{admin ? '뉴스 승인' : current.label}</b>
            </span>
          </div>
          <div className="account-actions">
            {!identity.loaded ? (
              <span className="account-name">계정 확인 중…</span>
            ) : identity.signedIn ? (
              <>
                <span className="account-name">{identity.displayName || identity.email}</span>
                <a href="/account" aria-label="계정 설정">
                  <Settings size={18} />
                </a>
                <button aria-label="로그아웃" disabled={busy} onClick={() => void logout()}>
                  <LogOut size={18} />
                </button>
              </>
            ) : (
              <>
                <a href="/login">로그인</a>
                <a className="top-signup" href="/signup">
                  회원가입
                </a>
              </>
            )}
          </div>
        </header>
        <main>
          <section className="page-heading">
            <div>
              <p className="eyebrow">{admin ? 'NEWS REVIEW' : 'THE COMMUNITY'}</p>
              <h1>
                {admin ? '뉴스 승인' : current.label}
                <span className="heading-dot">.</span>
              </h1>
              <p>{admin ? '제출된 기사를 검토하고 승인, 피드백 또는 반려해주세요.' : current.sub}</p>
            </div>
            {!admin && identity.signedIn && (
              <button className="primary" onClick={() => open()}>
                <Plus size={19} />
                {category === 'news' ? '기사 제출하기' : '글 작성하기'}
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
                <button onClick={() => open()}>
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
              <ReviewWorkspace userId={identity.userId} onNotice={setNotice} />
            ) : (
              <div className="admin-gate">
                <ShieldCheck size={32} />
                <h3>관리자 전용 공간입니다</h3>
                <p>
                  {!identity.configured
                    ? '관리자 코드 설정 후 이용할 수 있습니다.'
                    : !identity.signedIn
                      ? '로그인한 뒤 관리자 코드를 등록해주세요.'
                      : '학과에서 전달받은 관리자 코드를 등록해주세요.'}
                </p>
                {!identity.signedIn && identity.configured && (
                  <a className="primary" href="/login?returnTo=/admin/join">
                    관리자 로그인 <ArrowRight size={16} />
                  </a>
                )}
                {identity.signedIn && identity.configured && (
                  <a className="primary" href="/admin/join">
                    관리자 코드 등록 <ArrowRight size={16} />
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
              <p>
                누구나 미컴 라운지를 방문할 수 있지만, 게시글 열람과 작성은 인증을 마친 학과 구성원에게만 제공됩니다.
              </p>
              <div>
                <a className="primary" href={`/login?returnTo=${encodeURIComponent(paths[category])}`}>
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
                    <span>{loading ? '—' : visible.length}</span>
                  </h2>
                  <span className="sort-label">
                    최신순 <ArrowDown size={14} />
                  </span>
                </div>
                {
                  <div className="search-row">
                    <Search size={18} />
                    <input
                      aria-label="제목 검색"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="제목으로 게시글 검색"
                    />
                  </div>
                }
                {category === 'all' && (
                  <div className="filter-row" aria-label="게시글 분류">
                    {tabs
                      .filter((t) => t.id !== 'news')
                      .map((t) => (
                        <a key={t.id} className={category === t.id ? 'filter selected' : 'filter'} href={paths[t.id]}>
                          {t.id === 'all' ? '전체' : t.label}
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
                ) : (
                  !error &&
                  (visible.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-icon">
                        <FileText size={28} />
                      </div>
                      <h3>
                        {query
                          ? '검색 결과가 없습니다'
                          : category === 'news'
                            ? '아직 제출한 기사가 없어요'
                            : '아직 올라온 이야기가 없어요'}
                      </h3>
                      <p>
                        {query
                          ? '다른 검색어로 다시 찾아보세요.'
                          : category === 'news'
                            ? '기사를 제출하면 검토 결과를 이곳에서 확인할 수 있어요.'
                            : '첫 번째 글로 우리 학과의 이야기를 시작해보세요.'}
                      </p>
                      {!query && (
                        <button className="text-button" onClick={() => open()}>
                          {category === 'news' ? '첫 기사 제출하기' : '첫 글 작성하기'} <ArrowRight size={16} />
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="post-list">
                      {visible.map((p) => {
                        const content = (
                          <>
                            <div className={`category-symbol ${p.category}`}>
                              {p.category === 'news' ? (
                                <Newspaper size={21} />
                              ) : p.category === 'clubs' ? (
                                <Users size={21} />
                              ) : p.category === 'contests' ? (
                                <Trophy size={21} />
                              ) : (
                                <FileText size={21} />
                              )}
                            </div>
                            <div className="post-info">
                              <span className={`category-tag ${p.category}`}>{labels[p.category]}</span>
                              {category === 'news' && p.status && (
                                <span className={`status-badge ${p.status}`}>{statusLabels[p.status]}</span>
                              )}
                              <h3>
                                {p.prefix && <span className="post-prefix">[{p.prefix}]</span>}
                                {p.title}
                              </h3>
                              {p.recruitment_status && (
                                <div className="recruitment-line">
                                  <span className={`recruitment-status ${p.recruitment_status}`}>
                                    {p.recruitment_status === 'open' ? '모집 중' : '마감'}
                                  </span>
                                  {p.deadline && (
                                    <span>
                                      <CalendarDays size={13} />
                                      {p.deadline}
                                    </span>
                                  )}
                                  {p.headcount && (
                                    <span>
                                      <UserRound size={13} />
                                      {p.headcount}명
                                    </span>
                                  )}
                                </div>
                              )}
                              <div className="post-meta">
                                {p.author_name || '이름 없음'}
                                <span>·</span>
                                {formatDate(p.created_at)}
                              </div>
                            </div>
                            <ChevronRight className="row-arrow" size={19} />
                          </>
                        );
                        return (
                          <a className="post-row" key={p.id} href={`/posts/${p.id}`}>
                            {content}
                          </a>
                        );
                      })}
                    </div>
                  ))
                )}
                <div className="feed-foot">
                  <LockKeyhole size={14} />{' '}
                  {category === 'news'
                    ? '학과 뉴스는 작성자와 관리자만 볼 수 있습니다.'
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
                      <strong>비밀번호를 기억해주세요</strong>
                      <p>글을 수정·삭제할 때 필요해요.</p>
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
          <footer className="page-footer">
            <strong>미컴 라운지</strong>
            <span>서로를 존중하는 말이 좋은 커뮤니티를 만듭니다.</span>
          </footer>
        </main>
      </div>
      {notice && (
        <div className="toast" role="status">
          <Check size={18} />
          {notice}
        </div>
      )}
      <dialog
        ref={dialog}
        aria-label="게시글"
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        onClick={(e) => {
          if (e.target === dialog.current) close();
        }}
        className="post-dialog"
      >
        <div className="dialog-inner">
          <button className="dialog-close icon-button" aria-label="닫기" disabled={busy} onClick={close}>
            <X size={21} />
          </button>
          {mode === 'create' && (
            <>
              <p className="eyebrow">WRITE A STORY</p>
              <h2>{draftCategory === 'news' ? '기사 제출' : '새로운 이야기'}</h2>
              <form onSubmit={submit}>
                {category !== 'all' && (
                  <>
                    <input type="hidden" name="category" value={category} />
                    <p className="form-note">{labels[category]} 게시판에 작성합니다.</p>
                  </>
                )}
                {category === 'all' && (
                  <label>
                    게시할 공간
                    <select
                      name="category"
                      value={draftCategory}
                      onChange={(e) => setDraftCategory(e.target.value as Exclude<Category, 'all'>)}
                    >
                      <option value="board">자유게시판</option>
                      <option value="news">학과 뉴스 · 관리자 검토</option>
                      <option value="clubs">동아리</option>
                      <option value="contests">공모전 모집</option>
                    </select>
                  </label>
                )}
                {
                  <div className="form-grid">
                    <label>
                      작성자 이름
                      <input name="author_name" required maxLength={20} placeholder="게시글에 표시될 이름" />
                    </label>
                    <label>
                      머릿글 <small className="inline-optional">선택</small>
                      <input name="prefix" maxLength={30} placeholder={prefixHints[draftCategory]} />
                    </label>
                  </div>
                }
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
                {(draftCategory === 'clubs' || draftCategory === 'contests') && (
                  <fieldset className="recruitment-fields">
                    <legend>모집 정보</legend>
                    <div className="form-grid">
                      <label>
                        모집 상태
                        <select name="recruitment_status" defaultValue="open">
                          <option value="open">모집 중</option>
                          <option value="closed">마감</option>
                        </select>
                      </label>
                      <label>
                        모집 마감일
                        <input name="deadline" type="date" required />
                      </label>
                      <label>
                        모집 인원
                        <input name="headcount" type="number" min="1" max="99" required placeholder="예: 3" />
                      </label>
                      <label>
                        필요한 역할
                        <input name="roles" required maxLength={200} placeholder="예: 기획, 디자인, 개발" />
                      </label>
                    </div>
                  </fieldset>
                )}
                {
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
                    <small>글을 수정하거나 삭제할 때 필요해요. 비밀번호를 기억해주세요.</small>
                  </label>
                }
                <p className="form-note">
                  {draftCategory === 'news'
                    ? '기사는 나와 관리자만 볼 수 있고, 검토 결과는 뉴스 탭에서 확인할 수 있어요.'
                    : ''}
                </p>
                {modalError && (
                  <p className="form-error" role="alert">
                    {modalError}
                  </p>
                )}
                <button className="primary full" disabled={busy}>
                  {busy ? '저장 중…' : draftCategory === 'news' ? '기사 제출' : '작성 완료'}
                  <ArrowRight size={17} />
                </button>
              </form>
            </>
          )}
        </div>
      </dialog>
    </div>
  );
}
