'use client';

import { recruitmentState } from '../../../lib/recruitment';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  FileText,
  Link2,
  LockKeyhole,
  UserRound,
  Users,
} from 'lucide-react';
import { AnnotatedArticle, statusLabels } from '../../annotated-article';
import type { Review } from '../../../lib/annotations';
import { api } from '../../api-client';
import { AppShell, boardLabels, boardPaths, deskStatus, type ShellIdentity } from '../../app-shell';
import Comments from './comments';
import { WriterTag, type Writer } from '../../writer-tag';
import { ImageGallery, ImagePicker } from '../../image-picker';

type Category = 'board' | 'inquiry' | 'complaint' | 'news' | 'clubs' | 'contests';
type Post = {
  id: string;
  title: string;
  category: Category;
  created_at: number;
  updated_at: number;
  content: string;
  status: string;
  prefix: string | null;
  author_name: string | null;
  feedback: Review | null;
  recruitment_status?: 'open' | 'closed' | null;
  deadline?: string | null;
  headcount?: number | null;
  roles?: string | null;
  mine?: boolean;
  writer?: Writer;
  images?: string[];
  resolved_at?: number | null;
  pinned_at?: number | null;
  club_id?: string | null;
  club_name?: string | null;
};
type Identity = ShellIdentity & { admin?: boolean };
const formatDate = (n: number) =>
  new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }).format(n);

export default function PostDetail({ id }: { id: string }) {
  const [post, setPost] = useState<Post | null>(null);
  const [identity, setIdentity] = useState<Identity>({ loaded: false, signedIn: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'view' | 'edit' | 'delete'>('view');
  const [notice, setNotice] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [clubs, setClubs] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (mode !== 'edit' || post?.category !== 'clubs') return;
    api<{ clubs: { id: string; name: string }[] }>('/api/clubs')
      .then((data) => setClubs(data.clubs))
      .catch(() => setClubs([]));
  }, [mode, post?.category]);
  const reload = useCallback(async () => {
    const data = await api<{ post: Post }>(`/api/posts/${id}`);
    setPost(data.post);
  }, [id]);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const session = await api<Identity>('/api/session');
        if (!active) return;
        setIdentity({ ...session, loaded: true });
        if (!session.signedIn) return;
        const data = await api<{ post: Post }>(`/api/posts/${id}`);
        if (active) setPost(data.post);
      } catch (e) {
        if (active) {
          setIdentity((value) => ({ ...value, loaded: true }));
          setError((e as Error).message);
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [id]);
  async function edit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!post) return;
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const recruitment =
      post.category === 'clubs' || post.category === 'contests'
        ? {
            recruitment_status: form.get('recruitment_status') || null,
            deadline: form.get('deadline') || null,
            headcount: form.get('headcount') ? Number(form.get('headcount')) : null,
            roles: String(form.get('roles') || '').trim() || null,
          }
        : {};
    try {
      const data = await api<{ status: string }>(
        `/api/posts/${id}`,
        {
          title: form.get('title'),
          content: form.get('content'),
          author_name: form.get('author_name'),
          prefix: form.get('prefix'),
          images,
          password: form.get('password') || undefined,
          ...recruitment,
          ...(post.category === 'clubs' ? { club_id: form.get('club_id') || null } : {}),
        },
        'PATCH',
      );
      await reload();
      setMode('view');
      setNotice(data.status === 'pending' ? '기사를 다시 제출했습니다. 관리자 검토를 기다려주세요.' : '수정했습니다.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!post) return;
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      await api(`/api/posts/${id}`, { password: form.get('password') || undefined }, 'DELETE');
      window.location.assign(boardPaths[post.category]);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  async function setPinned(value: boolean) {
    if (!post) return;
    setBusy(true);
    setError('');
    try {
      await api(`/api/posts/${id}/flags`, { pinned: value });
      setPost({ ...post, pinned_at: value ? Date.now() : null });
      setNotice(value ? '게시판 상단에 고정했습니다.' : '고정을 해제했습니다.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setNotice('게시글 링크를 복사했습니다.');
    } catch {
      setError('링크를 복사하지 못했습니다. 주소창의 주소를 복사해주세요.');
    }
  }
  const category = post?.category;
  const news = category === 'news';
  const admin = !!identity.admin;
  const canEdit = !!post && (admin || !(news && post.status === 'rejected'));
  const passwordField = !admin && !post?.mine && (
    <label>
      {mode === 'edit' ? '수정 확인 비밀번호' : '삭제 확인 비밀번호'}
      <input name="password" type="password" required minLength={8} maxLength={128} autoComplete="off" />
    </label>
  );
  return (
    <AppShell
      active={null}
      identity={identity}
      mainClassName="detail-main"
      breadcrumb={
        <>
          <a href="/">라운지</a>
          <ChevronRight size={14} />
          {category && (
            <>
              <a href={boardPaths[category]}>{boardLabels[category]}</a>
              <ChevronRight size={14} />
            </>
          )}
          <b>상세</b>
        </>
      }
    >
      <a className="back-link" href={category ? boardPaths[category] : '/'}>
        <ArrowLeft size={17} />
        {news ? '내 기사 목록' : category ? `${boardLabels[category]} 목록` : '게시판 목록'}
      </a>
      {loading ? (
        <section className="detail-card loading" role="status">
          회원 계정을 확인하는 중입니다…
        </section>
      ) : !identity.signedIn ? (
        <section className="member-gate">
          <div className="member-gate-icon">
            <LockKeyhole size={29} />
          </div>
          <p className="eyebrow">SCHOOL MEMBERS ONLY</p>
          <h2>게시글은 회원만 볼 수 있어요</h2>
          <p>학교 이메일 인증을 마친 뒤 게시글 제목과 내용을 확인할 수 있습니다.</p>
          <div>
            <a className="primary" href={`/login?returnTo=${encodeURIComponent(`/posts/${id}`)}`}>
              로그인 <ArrowRight size={17} />
            </a>
            <a className="secondary" href="/signup">
              회원가입
            </a>
          </div>
          <small>@ks.ac.kr 이메일이 필요합니다.</small>
        </section>
      ) : error && !post ? (
        <section className="detail-card detail-error">
          <FileText size={32} />
          <h1>게시글을 찾을 수 없습니다</h1>
          <p>{error}</p>
          <a className="primary" href="/">
            게시판으로 돌아가기
          </a>
        </section>
      ) : (
        post && (
          <section className="detail-card">
            <div className="detail-head">
              <div>
                <span className={`category-tag ${post.category}`}>
                  {boardLabels[post.category]}
                  {post.club_name && ` · ${post.club_name}`}
                </span>
                {news && <span className={`status-badge ${post.status}`}>{statusLabels[post.status]}</span>}
                {post.pinned_at && <span className="status-badge feedback">고정</span>}
                {deskStatus[post.category] && (
                  <span className={`status-badge ${post.resolved_at ? 'published' : 'pending'}`}>
                    {deskStatus[post.category]?.[post.resolved_at ? 1 : 0]}
                  </span>
                )}
                <h1>
                  {post.prefix && <span className="post-prefix">[{post.prefix}]</span>}
                  {post.title}
                </h1>
                <p>
                  {post.author_name || '이름 없음'} · {formatDate(post.created_at)}
                  <WriterTag writer={post.writer} />
                </p>
              </div>
              {!news && !deskStatus[post.category] && (
                <button className="secondary copy-button" onClick={() => void copyLink()}>
                  <Link2 size={17} />
                  링크 복사
                </button>
              )}
            </div>
            {(post.recruitment_status || post.deadline || post.headcount || post.roles) && (
              <div className="recruitment-summary">
                {recruitmentState(post.recruitment_status, post.deadline) && (
                  <span className={`recruitment-status ${recruitmentState(post.recruitment_status, post.deadline)}`}>
                    {recruitmentState(post.recruitment_status, post.deadline) === 'open' ? '모집 중' : '마감'}
                  </span>
                )}
                {post.deadline && (
                  <span>
                    <CalendarDays size={17} />
                    <small>마감일</small>
                    {post.deadline}
                  </span>
                )}
                {post.headcount && (
                  <span>
                    <UserRound size={17} />
                    <small>모집 인원</small>
                    {post.headcount}명
                  </span>
                )}
                {post.roles && (
                  <span>
                    <Users size={17} />
                    <small>필요한 역할</small>
                    {post.roles}
                  </span>
                )}
              </div>
            )}
            {notice && (
              <p className="inline-notice">
                <Check size={16} />
                {notice}
              </p>
            )}
            {news && post.status === 'pending' && (
              <div className="review-result pending">
                <strong>검토 중</strong>
                <p>관리자가 기사를 검토하고 있어요.</p>
              </div>
            )}
            {news && post.status === 'published' && (
              <div className="review-result published">
                <strong>승인 완료</strong>
                <p>관리자가 기사를 승인했어요.</p>
              </div>
            )}
            {news && post.feedback && (post.status === 'feedback' || post.status === 'rejected') && (
              <div className={`review-result ${post.status}`}>
                <strong>{post.status === 'rejected' ? '반려되었어요' : '피드백이 도착했어요'}</strong>
                {post.feedback.note && <p>{post.feedback.note}</p>}
                {post.status === 'feedback' && (
                  <p className="review-hint">표시된 부분을 확인하고 기사를 수정해 다시 제출해주세요.</p>
                )}
                {post.status === 'rejected' && (
                  <p className="review-hint">반려된 기사는 수정할 수 없어요. 새 기사로 작성해주세요.</p>
                )}
              </div>
            )}
            {mode === 'view' && (
              <>
                <AnnotatedArticle
                  content={post.content}
                  marks={post.status === 'feedback' ? post.feedback?.marks || [] : []}
                  className="detail-article"
                />
                <ImageGallery keys={post.images || []} />
                {error && (
                  <p className="form-error" role="alert">
                    {error}
                  </p>
                )}
                <div className="article-actions">
                  {admin && !news && !deskStatus[post.category] && (
                    <button className="secondary" disabled={busy} onClick={() => void setPinned(!post.pinned_at)}>
                      {post.pinned_at ? '고정 해제' : '상단 고정'}
                    </button>
                  )}
                  {canEdit && (
                    <button
                      className="secondary"
                      onClick={() => {
                        setError('');
                        setImages(post.images || []);
                        setMode('edit');
                      }}
                    >
                      {news && post.status === 'feedback' ? '수정해서 다시 제출' : '수정'}
                    </button>
                  )}
                  <button
                    className="danger-text"
                    onClick={() => {
                      setError('');
                      setMode('delete');
                    }}
                  >
                    삭제
                  </button>
                </div>
              </>
            )}
            {mode === 'edit' && (
              <form className="detail-form" onSubmit={edit}>
                <h2>{news ? '기사 수정' : '게시글 수정'}</h2>
                {news && post.status === 'feedback' && (
                  <>
                    <AnnotatedArticle
                      content={post.content}
                      marks={post.feedback?.marks || []}
                      className="feedback-reference"
                    />
                  </>
                )}
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
                <div className="form-grid">
                  <label>
                    별명
                    <input name="author_name" required maxLength={20} defaultValue={post.author_name || ''} />
                  </label>
                  <label>
                    머릿글 <small className="inline-optional">선택</small>
                    <input name="prefix" maxLength={30} defaultValue={post.prefix || ''} />
                  </label>
                </div>
                <label>
                  제목
                  <input name="title" required maxLength={120} defaultValue={post.title} />
                </label>
                <label>
                  본문
                  <textarea name="content" required maxLength={20000} rows={10} defaultValue={post.content} />
                </label>
                <ImagePicker value={images} onChange={setImages} onBusy={setUploading} />
                {(post.category === 'clubs' || post.category === 'contests') && (
                  <fieldset className="recruitment-fields">
                    <legend>모집 정보 (선택)</legend>
                    <div className="form-grid">
                      <label>
                        모집 상태
                        <select name="recruitment_status" defaultValue={post.recruitment_status || ''}>
                          <option value="">선택 안 함</option>
                          <option value="open">모집 중</option>
                          <option value="closed">마감</option>
                        </select>
                      </label>
                      <label>
                        모집 마감일
                        <input name="deadline" type="date" defaultValue={post.deadline || ''} />
                      </label>
                      <label>
                        모집 인원
                        <input name="headcount" type="number" min="1" max="99" defaultValue={post.headcount || ''} />
                      </label>
                      <label>
                        필요한 역할
                        <input name="roles" maxLength={200} defaultValue={post.roles || ''} />
                      </label>
                    </div>
                  </fieldset>
                )}
                {passwordField}
                {news && <p className="form-note">수정하면 기사가 다시 승인 대기 상태로 바뀝니다.</p>}
                {error && (
                  <p className="form-error" role="alert">
                    {error}
                  </p>
                )}
                <div className="article-actions">
                  <button type="button" className="secondary" onClick={() => setMode('view')}>
                    취소
                  </button>
                  <button className="primary" disabled={busy || uploading}>
                    {busy ? '저장 중…' : news ? '다시 제출' : '수정 저장'}
                  </button>
                </div>
              </form>
            )}
            {mode === 'delete' && (
              <form className="delete-panel" onSubmit={remove}>
                <h2>게시글을 삭제할까요?</h2>
                <p>삭제한 글은 복구할 수 없습니다.</p>
                {passwordField}
                {error && (
                  <p className="form-error" role="alert">
                    {error}
                  </p>
                )}
                <div className="article-actions">
                  <button type="button" className="secondary" onClick={() => setMode('view')}>
                    취소
                  </button>
                  <button className="primary danger" disabled={busy}>
                    {busy ? '삭제 중…' : '게시글 삭제'}
                  </button>
                </div>
              </form>
            )}
            {!news && mode === 'view' && <Comments postId={post.id} />}
          </section>
        )
      )}
    </AppShell>
  );
}
