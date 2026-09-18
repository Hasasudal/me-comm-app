'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  FileDown,
  FileText,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  StickyNote,
  Trash2,
  UserMinus,
  X,
} from 'lucide-react';
import { AnnotatedArticle, statusLabels } from '../annotated-article';
import type { Mark, Review } from '../../lib/annotations';
import { api } from '../api-client';
import { exportFileName, newsDocx } from '../../lib/news-docx';

type ReviewStatus = 'pending' | 'feedback' | 'rejected' | 'published';
type Article = {
  id: string;
  title: string;
  content: string;
  prefix: string | null;
  author_name: string | null;
  status: ReviewStatus;
  feedback: Review | null;
  created_at: number;
  updated_at: number;
};
type AdminMember = { user_id: string; email: string; display_name: string; joined_at: number };
const reviewTabs: ReviewStatus[] = ['pending', 'feedback', 'rejected', 'published'];
const formatDate = (n: number) => new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit' }).format(n);

// Unsent marks survive reloads in this browser. The key includes updated_at, so a resubmitted article starts clean.
type Draft = { marks: Mark[]; note: string };
const draftKey = (article: Article) => `micom:review-draft:${article.id}:${article.updated_at}`;
function readDraft(article: Article): Draft | null {
  try {
    return JSON.parse(localStorage.getItem(draftKey(article)) || 'null') as Draft | null;
  } catch {
    return null;
  }
}
function writeDraft(article: Article, draft: Draft | null) {
  try {
    if (draft) localStorage.setItem(draftKey(article), JSON.stringify(draft));
    else localStorage.removeItem(draftKey(article));
  } catch {}
}

export default function ReviewWorkspace({
  userId,
  onNotice,
}: {
  userId?: string;
  onNotice: (message: string) => void;
}) {
  const [tab, setTab] = useState<ReviewStatus>('pending');
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [note, setNote] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [panel, setPanel] = useState<'review' | 'reject' | 'edit' | 'delete'>('review');
  const [reason, setReason] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [actionError, setActionError] = useState('');
  const [members, setMembers] = useState<AdminMember[]>([]);
  const [revoked, setRevoked] = useState<AdminMember[]>([]);
  const [membersError, setMembersError] = useState('');
  const loadId = useRef(0);
  const selected = articles.find((article) => article.id === selectedId) || null;
  const dirty = tab === 'pending' && (marks.length > 0 || !!note.trim());

  const reset = useCallback((article: Article | null) => {
    const draft = article?.status === 'pending' ? readDraft(article) : null;
    setMarks(draft?.marks || (article && article.status !== 'pending' ? article.feedback?.marks || [] : []));
    setNote(draft?.note || '');
    setNoteOpen(!!draft?.note);
    setPanel('review');
    setReason('');
    setMenuOpen(false);
    setActionError('');
  }, []);
  const load = useCallback(
    async (keepId?: string | null) => {
      const id = ++loadId.current;
      setLoading(true);
      setError('');
      try {
        const data = await api<{ posts: Article[] }>(`/api/admin/posts?status=${tab}`);
        if (id !== loadId.current) return;
        setArticles(data.posts);
        const next = data.posts.find((article) => article.id === keepId) || data.posts[0] || null;
        setSelectedId(next?.id || null);
        reset(next);
      } catch (e) {
        if (id === loadId.current) setError((e as Error).message);
      } finally {
        if (id === loadId.current) setLoading(false);
      }
    },
    [tab, reset],
  );
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  const loadMembers = useCallback(async () => {
    setMembersError('');
    try {
      const roster = await api<{ members: AdminMember[]; revoked: AdminMember[] }>('/api/admin/members');
      setMembers(roster.members);
      setRevoked(roster.revoked);
    } catch (e) {
      setMembersError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void loadMembers(), 0);
    return () => clearTimeout(timer);
  }, [loadMembers]);

  useEffect(() => {
    if (selected?.status === 'pending') writeDraft(selected, dirty ? { marks, note } : null);
  }, [selected, dirty, marks, note]);

  function choose(article: Article) {
    if (article.id === selectedId) return;
    setSelectedId(article.id);
    reset(article);
  }
  function switchTab(next: ReviewStatus) {
    if (next !== tab) setTab(next);
  }

  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    setActionError('');
    try {
      await action();
      if (selected) writeDraft(selected, null);
      onNotice(message);
      await load(null);
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const patch = (body: Record<string, unknown>) =>
    api(`/api/admin/posts/${selected!.id}`, { ...body, updated_at: selected!.updated_at }, 'PATCH');
  const approve = () => {
    if (!dirty || window.confirm('남긴 표시와 의견은 보내지 않고 승인할까요?'))
      void run(() => patch({ action: 'approve' }), '기사를 승인했습니다.');
  };
  const sendFeedback = () => run(() => patch({ action: 'feedback', note: note.trim(), marks }), '피드백을 보냈습니다.');
  const reject = () => run(() => patch({ action: 'reject', note: reason.trim() }), '기사를 반려했습니다.');
  const remove = () => run(() => api(`/api/posts/${selected!.id}`, {}, 'DELETE'), '기사를 삭제했습니다.');
  async function saveEdit(form: FormData) {
    setBusy(true);
    setActionError('');
    try {
      await patch({
        action: 'edit',
        title: form.get('title'),
        content: form.get('content'),
        prefix: form.get('prefix'),
      });
      onNotice('기사를 수정했습니다.');
      await load(selected!.id);
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function exportWord(list: Article[]) {
    setMenuOpen(false);
    setExporting(true);
    try {
      const blob = await newsDocx(list);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = exportFileName(list);
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    } catch {
      onNotice('Word 파일을 만들지 못했습니다. 다시 시도해주세요.');
    } finally {
      setExporting(false);
    }
  }
  async function revokeMember(member: AdminMember) {
    if (!window.confirm(`${member.display_name}님의 관리자 권한을 회수할까요?`)) return;
    setMembersError('');
    try {
      await api(`/api/admin/members/${encodeURIComponent(member.user_id)}`, {}, 'DELETE');
      onNotice(`${member.display_name}님의 관리자 권한을 회수했습니다.`);
      await loadMembers();
    } catch (e) {
      setMembersError((e as Error).message);
    }
  }

  async function restoreMember(member: AdminMember) {
    if (!window.confirm(`${member.display_name}님의 관리자 권한을 복구할까요?`)) return;
    setMembersError('');
    try {
      await api(`/api/admin/members/${encodeURIComponent(member.user_id)}`, {});
      onNotice(`${member.display_name}님의 관리자 권한을 복구했습니다.`);
      await loadMembers();
    } catch (e) {
      setMembersError((e as Error).message);
    }
  }

  const feedbackCount = marks.length + (note.trim() ? 1 : 0);
  return (
    <div className="review-workspace">
      <section className="review-list" aria-label="기사 목록">
        <div className="review-tabs" role="tablist" aria-label="검토 상태">
          {reviewTabs.map((status) => (
            <button
              key={status}
              role="tab"
              aria-selected={tab === status}
              className={tab === status ? 'active' : ''}
              onClick={() => switchTab(status)}
            >
              {statusLabels[status]}
            </button>
          ))}
        </div>
        {error && (
          <div className="error-box" role="alert">
            {error}
            <button onClick={() => void load(selectedId)}>다시 시도</button>
          </div>
        )}
        {loading ? (
          <p className="review-list-empty" role="status">
            불러오는 중…
          </p>
        ) : !error && articles.length === 0 ? (
          <p className="review-list-empty">{statusLabels[tab]} 기사가 없습니다.</p>
        ) : (
          <ul>
            {tab === 'published' && (
              <li>
                <button className="export-all" disabled={exporting} onClick={() => void exportWord(articles)}>
                  <FileDown size={16} />
                  {exporting ? 'Word 파일 만드는 중…' : `승인 기사 모두 Word로 (${articles.length})`}
                </button>
              </li>
            )}
            {articles.map((article) => (
              <li key={article.id}>
                <button
                  className={article.id === selectedId ? 'review-item selected' : 'review-item'}
                  aria-current={article.id === selectedId}
                  onClick={() => choose(article)}
                >
                  <strong>
                    {article.prefix && <span className="post-prefix">[{article.prefix}]</span>}
                    {article.title}
                  </strong>
                  <small>
                    {article.author_name || '이름 없음'} · {formatDate(article.updated_at)}
                  </small>
                </button>
              </li>
            ))}
          </ul>
        )}
        <details className="review-admins">
          <summary>
            관리자 계정 <span>{members.length}</span>
            <ChevronDown size={15} />
          </summary>
          {members.map((member) => (
            <div className="member-row" key={member.user_id}>
              <div>
                <strong>{member.display_name}</strong>
                <small>{member.email}</small>
              </div>
              {member.user_id === userId ? (
                <span>현재 계정</span>
              ) : (
                <button aria-label={`${member.display_name} 권한 회수`} onClick={() => void revokeMember(member)}>
                  <UserMinus size={16} />
                </button>
              )}
            </div>
          ))}
          {revoked.length > 0 && <p className="revoked-caption">회수된 관리자</p>}
          {revoked.map((member) => (
            <div className="member-row revoked" key={member.user_id}>
              <div>
                <strong>{member.display_name}</strong>
                <small>{member.email}</small>
              </div>
              <button aria-label={`${member.display_name} 권한 복구`} onClick={() => void restoreMember(member)}>
                <RotateCcw size={16} />
              </button>
            </div>
          ))}
          {membersError && <p className="form-error">{membersError}</p>}
          <a className="text-button" href="/admin/members">
            전체 회원 관리 <ArrowRight size={15} />
          </a>
        </details>
      </section>

      <section className="review-panel" aria-label="기사 검토">
        {!selected ? (
          <div className="review-empty">
            <FileText size={30} />
            <p>{loading ? '기사를 불러오는 중입니다…' : '왼쪽 목록에서 기사를 선택하세요.'}</p>
          </div>
        ) : (
          <>
            <header className="review-head">
              <div>
                <span className={`status-badge ${selected.status}`}>{statusLabels[selected.status]}</span>
                <h2>
                  {selected.prefix && <span className="post-prefix">[{selected.prefix}]</span>}
                  {selected.title}
                </h2>
                <p>
                  {selected.author_name || '이름 없음'} · 제출 {formatDate(selected.created_at)}
                </p>
              </div>
              <div className="more-menu">
                <button
                  className="icon-button"
                  aria-label="더보기"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen(!menuOpen)}
                >
                  <MoreHorizontal size={20} />
                </button>
                {menuOpen && (
                  <div className="more-list" role="menu">
                    <button role="menuitem" disabled={exporting} onClick={() => void exportWord([selected])}>
                      <FileDown size={15} />
                      Word로 내보내기
                    </button>
                    {selected.status === 'pending' && (
                      <button
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          setPanel('edit');
                        }}
                      >
                        <Pencil size={15} />
                        기사 수정
                      </button>
                    )}
                    <button
                      role="menuitem"
                      className="danger-text"
                      onClick={() => {
                        setMenuOpen(false);
                        setPanel('delete');
                      }}
                    >
                      <Trash2 size={15} />
                      기사 삭제
                    </button>
                  </div>
                )}
              </div>
            </header>

            {panel === 'edit' ? (
              <form
                className="review-edit"
                key={selected.id}
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveEdit(new FormData(event.currentTarget));
                }}
              >
                <label>
                  머릿글 <small className="inline-optional">선택</small>
                  <input name="prefix" maxLength={30} defaultValue={selected.prefix || ''} />
                </label>
                <label>
                  제목
                  <input name="title" required maxLength={120} defaultValue={selected.title} />
                </label>
                <label>
                  본문
                  <textarea name="content" required maxLength={20000} rows={12} defaultValue={selected.content} />
                </label>
                {actionError && (
                  <p className="form-error" role="alert">
                    {actionError}
                  </p>
                )}
                <div className="review-actions">
                  <button type="button" className="secondary" onClick={() => setPanel('review')}>
                    취소
                  </button>
                  <button className="primary" disabled={busy}>
                    {busy ? '저장 중…' : '수정 저장'}
                  </button>
                </div>
              </form>
            ) : (
              <>
                {selected.status === 'pending' ? (
                  <p className="review-hint">
                    {dirty
                      ? '작성 중인 표시와 의견은 이 브라우저에 임시 저장됩니다.'
                      : '본문을 드래그하면 형광펜·굵게·메모 도구가 나타납니다.'}
                  </p>
                ) : (
                  selected.feedback?.note && (
                    <div className={`review-result ${selected.status}`}>
                      <strong>{selected.status === 'rejected' ? '반려 사유' : '보낸 의견'}</strong>
                      <p>{selected.feedback.note}</p>
                    </div>
                  )
                )}
                <AnnotatedArticle
                  content={selected.content}
                  marks={marks}
                  onChange={selected.status === 'pending' && panel === 'review' ? setMarks : undefined}
                />

                {selected.status === 'pending' &&
                  panel === 'review' &&
                  (noteOpen || note ? (
                    <label className="review-note">
                      전체 의견
                      <textarea
                        autoFocus={noteOpen && !note}
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        maxLength={2000}
                        rows={3}
                        placeholder="기사 전체에 대한 의견을 적어주세요."
                      />
                    </label>
                  ) : (
                    <button className="text-button add-note" onClick={() => setNoteOpen(true)}>
                      <Plus size={15} />
                      전체 의견 추가
                    </button>
                  ))}

                {panel === 'reject' && (
                  <div className="review-confirm reject">
                    <label>
                      반려 사유
                      <textarea
                        autoFocus
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        maxLength={2000}
                        rows={3}
                        placeholder="작성자에게 전할 반려 사유를 적어주세요."
                      />
                    </label>
                    <div className="review-actions">
                      <button className="secondary" onClick={() => setPanel('review')}>
                        취소
                      </button>
                      <button
                        className="primary danger"
                        disabled={busy || !reason.trim()}
                        onClick={() => void reject()}
                      >
                        {busy ? '처리 중…' : '반려 확정'}
                      </button>
                    </div>
                  </div>
                )}
                {panel === 'delete' && (
                  <div className="review-confirm">
                    <p>이 기사를 삭제할까요? 삭제한 기사는 복구할 수 없습니다.</p>
                    <div className="review-actions">
                      <button className="secondary" onClick={() => setPanel('review')}>
                        취소
                      </button>
                      <button className="primary danger" disabled={busy} onClick={() => void remove()}>
                        <Trash2 size={16} />
                        {busy ? '삭제 중…' : '삭제'}
                      </button>
                    </div>
                  </div>
                )}

                {actionError && (
                  <p className="form-error" role="alert">
                    {actionError}
                  </p>
                )}
                {selected.status === 'pending' && panel === 'review' && (
                  <div className="review-actionbar">
                    <button className="secondary reject-button" disabled={busy} onClick={() => setPanel('reject')}>
                      <X size={16} />
                      반려
                    </button>
                    <button
                      className="secondary"
                      disabled={busy || feedbackCount === 0}
                      title={feedbackCount ? undefined : '표시나 전체 의견을 먼저 남겨주세요'}
                      onClick={() => void sendFeedback()}
                    >
                      <StickyNote size={16} />
                      피드백 보내기{feedbackCount > 0 && <span className="count">{feedbackCount}</span>}
                    </button>
                    <button className="primary" disabled={busy} onClick={() => void approve()}>
                      <Check size={17} />
                      승인
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}
