'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { MessageSquare, Trash2 } from 'lucide-react';
import { api } from '../../api-client';
import { roleLabels, type Role } from '../../app-shell';
import { WriterTag, type Writer } from '../../writer-tag';

type Comment = {
  id: string;
  author_name: string;
  content: string;
  created_at: number;
  deletable: boolean;
  role: Exclude<Role, 'member'> | null;
  writer?: Writer;
};
const formatTime = (n: number) =>
  new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(n);

export default function Comments({ postId }: { postId: string }) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api<{ comments: Comment[] }>(`/api/posts/${postId}/comments`)
      .then((data) => active && setComments(data.comments))
      .catch((e) => active && setError((e as Error).message));
    return () => {
      active = false;
    };
  }, [postId]);

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
      setComments((list) => [...(list || []), comment]);
      // Keep the name for the next comment; clear only the text.
      (form.elements.namedItem('content') as HTMLTextAreaElement).value = '';
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(comment: Comment) {
    if (!window.confirm('댓글을 삭제할까요?')) return;
    setError('');
    try {
      await api(`/api/comments/${comment.id}`, {}, 'DELETE');
      setComments((list) => (list || []).filter((item) => item.id !== comment.id));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <section className="comments" aria-label="댓글">
      <h2>
        <MessageSquare size={18} />
        댓글 <span>{comments?.length ?? '—'}</span>
      </h2>
      {comments === null && !error ? (
        <p className="comments-empty">댓글을 불러오는 중입니다…</p>
      ) : comments?.length ? (
        <ul>
          {comments.map((comment) => (
            <li key={comment.id}>
              <div className="comment-head">
                <strong>
                  {comment.author_name}
                  {comment.role && <span className={`role-badge ${comment.role}`}>{roleLabels[comment.role]}</span>}
                </strong>
                <WriterTag writer={comment.writer} />
                <small>{formatTime(comment.created_at)}</small>
                {comment.deletable && (
                  <button aria-label="댓글 삭제" onClick={() => void remove(comment)}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              <p>{comment.content}</p>
            </li>
          ))}
        </ul>
      ) : (
        comments && <p className="comments-empty">첫 댓글을 남겨보세요.</p>
      )}
      <form className="comment-form" onSubmit={submit}>
        <input name="author_name" required maxLength={20} placeholder="별명" aria-label="댓글 별명" />
        <textarea
          name="content"
          required
          maxLength={1000}
          rows={3}
          placeholder="댓글을 입력해주세요."
          aria-label="댓글"
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
