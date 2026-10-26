'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { MessageSquare, Pencil, Trash2 } from 'lucide-react';
import { api } from '../../api-client';
import { confirmDialog } from '../../confirm-dialog';
import { roleLabels, type Role } from '../../app-shell';
import { WriterTag, type Writer } from '../../writer-tag';

type Comment = {
  id: string;
  author_name: string;
  content: string;
  created_at: number;
  edited_at?: number | null;
  deletable: boolean;
  editable?: boolean;
  role: Exclude<Role, 'member'> | null;
  writer?: Writer;
};
// Canned answers for staff on the desks (학사문의, 학생회 건의).
const answerTemplates = [
  '확인했어요. 처리 후 다시 안내드릴게요.',
  '담당 부서에 확인 중이에요. 조금만 기다려 주세요.',
  '관련 공지를 확인해 주세요: ',
  '추가로 궁금한 점이 있으면 댓글로 남겨 주세요.',
  '검토한 뒤 결과를 이 글에 답변드릴게요.',
];
const nameKey = 'micom:author-name';
const savedName = () => {
  try {
    return localStorage.getItem(nameKey) || '';
  } catch {
    return '';
  }
};
const formatTime = (n: number) =>
  new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(n);

// onChange runs after a comment is added or removed, so the parent can refresh state the server derives from comments (desk "answered" badge).
export default function Comments({ postId, onChange }: { postId: string; onChange?: () => void }) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [fresh, setFresh] = useState<string | null>(null);
  const [templates, setTemplates] = useState(false);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [itemError, setItemError] = useState<{ id: string; message: string } | null>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setName((value) => value || savedName()), 0);
    return () => clearTimeout(timer);
  }, []);
  // After posting, bring the new comment into view and focus it briefly.
  useEffect(() => {
    if (!fresh) return;
    const el = document.getElementById(`comment-${fresh}`);
    el?.scrollIntoView({
      block: 'center',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
    el?.focus({ preventScroll: true });
    const timer = setTimeout(() => setFresh(null), 2500);
    return () => clearTimeout(timer);
  }, [fresh]);

  useEffect(() => {
    let active = true;
    api<{ comments: Comment[]; templates?: boolean }>(`/api/posts/${postId}/comments`)
      .then((data) => {
        if (!active) return;
        setComments(data.comments);
        setTemplates(!!data.templates);
        // Deep link from the bell: /posts/{id}#comment-{commentId}.
        const target = location.hash.match(/^#comment-(.+)$/)?.[1];
        if (target && data.comments.some((item) => item.id === target)) setFresh(target);
      })
      .catch((e) => active && setLoadError((e as Error).message));
    return () => {
      active = false;
    };
  }, [postId, attempt]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError('');
    try {
      const { comment } = await api<{ comment: Comment }>(`/api/posts/${postId}/comments`, {
        author_name: data.get('author_name'),
        content: data.get('content'),
      });
      setFresh(comment.id);
      setComments((list) => [...(list || []), comment]);
      setName(String(data.get('author_name') || ''));
      try {
        localStorage.setItem(nameKey, String(data.get('author_name') || ''));
      } catch {}
      onChange?.();
      // Keep the name for the next comment; clear only the text.
      (form.elements.namedItem('content') as HTMLTextAreaElement).value = '';
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function save(comment: Comment) {
    if (!editing) return;
    setSaving(true);
    setItemError(null);
    try {
      const { comment: saved } = await api<{ comment: { content: string; edited_at: number } }>(
        `/api/comments/${comment.id}`,
        { content: editing.text },
        'PATCH',
      );
      setComments((list) => (list || []).map((item) => (item.id === comment.id ? { ...item, ...saved } : item)));
      setEditing(null);
      setTimeout(() => document.getElementById(`comment-${comment.id}`)?.focus(), 0);
    } catch (e) {
      setItemError({ id: comment.id, message: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function cancelEdit(comment: Comment) {
    if (editing && editing.text !== comment.content && !(await confirmDialog('고친 내용을 버릴까요?', { ok: '버리기', danger: true })))
      return;
    setEditing(null);
    setItemError(null);
    setTimeout(() => document.getElementById(`comment-${comment.id}`)?.focus(), 0);
  }

  async function startEdit(comment: Comment) {
    if (editing && editing.id !== comment.id && editing.text !== comments?.find((c) => c.id === editing.id)?.content) {
      if (!(await confirmDialog('고치던 내용을 버리고 다른 댓글을 고칠까요?', { ok: '버리기', danger: true }))) return;
    }
    setEditing({ id: comment.id, text: comment.content });
  }

  async function remove(comment: Comment) {
    if (!(await confirmDialog('댓글을 삭제할까요?', { ok: '삭제', danger: true }))) return;
    setItemError(null);
    try {
      await api(`/api/comments/${comment.id}`, {}, 'DELETE');
      setComments((list) => (list || []).filter((item) => item.id !== comment.id));
      onChange?.();
      setTimeout(() => heading.current?.focus(), 0);
    } catch (e) {
      setItemError({ id: comment.id, message: (e as Error).message });
    }
  }

  return (
    <section className="comments" aria-label="댓글">
      <h2 ref={heading} tabIndex={-1}>
        <MessageSquare size={18} />
        댓글 <span>{comments?.length ?? '—'}</span>
      </h2>
      {comments === null && loadError ? (
        <div className="form-error" role="alert">
          <p>{loadError}</p>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setLoadError('');
              setAttempt((n) => n + 1);
            }}
          >
            다시 시도
          </button>
        </div>
      ) : comments === null ? (
        <p className="comments-empty">댓글을 불러오는 중이에요…</p>
      ) : comments?.length ? (
        <ul>
          {comments.map((comment) => (
            <li
              key={comment.id}
              id={`comment-${comment.id}`}
              tabIndex={-1}
              className={comment.id === fresh ? 'comment-new' : undefined}
            >
              <div className="comment-head">
                <strong>
                  {comment.author_name}
                  {comment.role && <span className={`role-badge ${comment.role}`}>{roleLabels[comment.role]}</span>}
                </strong>
                <WriterTag writer={comment.writer} />
                <small>
                  {formatTime(comment.created_at)}
                  {comment.edited_at ? ' (수정됨)' : ''}
                </small>
                {comment.editable && editing?.id !== comment.id && (
                  <button aria-label="댓글 수정" onClick={() => void startEdit(comment)}>
                    <Pencil size={14} />
                  </button>
                )}
                {comment.deletable && (
                  <button aria-label="댓글 삭제" onClick={() => void remove(comment)}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              {editing?.id === comment.id ? (
                <div className="comment-edit">
                  <textarea
                    autoFocus
                    maxLength={1000}
                    rows={3}
                    aria-label="댓글 수정"
                    value={editing.text}
                    onChange={(e) => setEditing({ id: comment.id, text: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') void cancelEdit(comment);
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void save(comment);
                    }}
                  />
                  <div>
                    <button type="button" className="secondary" onClick={() => void cancelEdit(comment)}>
                      취소
                    </button>
                    <button
                      type="button"
                      className="primary"
                      disabled={saving || !editing.text.trim() || editing.text === comment.content}
                      onClick={() => void save(comment)}
                    >
                      {saving ? '저장 중…' : '저장'}
                    </button>
                  </div>
                </div>
              ) : (
                <p>{comment.content}</p>
              )}
              {itemError?.id === comment.id && (
                <p className="form-error" role="alert">
                  {itemError.message}
                </p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        comments && <p className="comments-empty">첫 댓글을 남겨보세요.</p>
      )}
      <form className="comment-form" onSubmit={submit}>
        <input
          name="author_name"
          required
          maxLength={20}
          placeholder="별명"
          aria-label="댓글 별명"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {templates && (
          <select
            className="comment-templates"
            aria-label="자주 쓰는 답변"
            value=""
            onChange={(e) => {
              const box = composer.current;
              if (!box || !e.target.value) return;
              box.value = box.value ? `${box.value.trimEnd()}\n${e.target.value}` : e.target.value;
              box.focus();
            }}
          >
            <option value="">자주 쓰는 답변</option>
            {answerTemplates.map((text) => (
              <option key={text} value={text}>
                {text}
              </option>
            ))}
          </select>
        )}
        <textarea
          ref={composer}
          name="content"
          required
          maxLength={1000}
          rows={3}
          placeholder="댓글을 입력해주세요."
          aria-label="댓글"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? '등록 중…' : '댓글 등록'}
        </button>
      </form>
    </section>
  );
}
