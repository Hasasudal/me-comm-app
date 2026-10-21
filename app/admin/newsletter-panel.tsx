'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Mail, Monitor, Send, Smartphone, Trash2, Upload } from 'lucide-react';
import { api } from '../api-client';

type Newsletter = {
  id: string;
  subject: string;
  created_at: number;
  created_by_name: string | null;
  sent_at: number | null;
  total: number;
  sent: number;
  failed: number;
  pending: number;
};
type Overview = { configured: boolean; remaining: number | null; subscribers: number; newsletters: Newsletter[] };
// sent/failed count this batch only; pending is everything still left.
type SendResult = {
  sent: number;
  failed: number;
  pending: number;
  remaining: number | null;
  done: boolean;
  exhausted: boolean;
};
const maxHtml = 150_000;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
type Progress = { sent: number; failed: number; total: number };

const formatDate = (n: number) =>
  new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(n);
const limitText = (remaining: number | null) => (remaining === null ? '확인 불가' : `${remaining}명`);
const limitHit = '오늘 발송 한도를 다 썼습니다. 내일 이어서 보내세요.';

// Exported newsletter files can start with plain-text lines (a title, "이메일 발송용 HTML 코드") before the markup.
// Returns the markup from <!doctype/<html on, plus a subject guess: the <title>, else that first text line.
function cleanNewsletterSource(text: string) {
  let html = text.trim();
  let lead = '';
  if (html && !html.startsWith('<')) {
    lead =
      html
        .split('\n')
        .find((line) => line.trim())
        ?.trim() || '';
    const start = html.search(/<!doctype|<html/i);
    if (start > 0) html = html.slice(start);
  }
  const title = new DOMParser().parseFromString(html, 'text/html').title.trim();
  return { html, subject: title || lead };
}

export default function NewsletterPanel({ onNotice }: { onNotice: (message: string) => void }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loadError, setLoadError] = useState('');
  const [subject, setSubject] = useState('');
  const [html, setHtml] = useState('');
  const [mobile, setMobile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  // A ref, not state: two fast clicks both see busy=false before React re-renders.
  const running = useRef(false);

  const load = useCallback(async () => {
    try {
      setOverview(await api<Overview>('/api/admin/newsletters'));
      setLoadError('');
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  // Closing the tab mid-send leaves the rest pending; the browser asks first.
  useEffect(() => {
    if (!progress || !busy) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [progress, busy]);

  function applySource(text: string) {
    const cleaned = cleanNewsletterSource(text);
    setHtml(cleaned.html);
    if (cleaned.subject) setSubject(cleaned.subject.slice(0, 150));
  }
  function readFile(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => applySource(String(reader.result || ''));
    reader.onerror = () => setError('파일을 읽지 못했습니다. 다시 선택해주세요.');
    reader.readAsText(file, 'utf-8');
  }

  async function guarded(action: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      running.current = false;
      setBusy(false);
      setProgress(null);
      void load();
    }
  }
  const sendTest = () =>
    guarded(async () => {
      const result = await api<{ ok: boolean; remaining: number | null }>('/api/admin/newsletters/test', {
        subject: subject.trim(),
        html,
      });
      setOverview((current) => (current ? { ...current, remaining: result.remaining } : current));
      onNotice('내 이메일로 테스트 메일을 보냈습니다.');
    });

  // One batch per request; keeps going until everything is out or today's quota runs out.
  async function deliver(id: string, base = { sent: 0, failed: 0 }) {
    let { sent, failed } = base;
    let idle = 0;
    for (;;) {
      const result = await api<SendResult>(`/api/admin/newsletters/${id}/send`, {});
      sent += result.sent;
      failed += result.failed;
      setProgress({ sent, failed, total: sent + failed + result.pending });
      setOverview((current) => (current ? { ...current, remaining: result.remaining } : current));
      if (result.done) {
        onNotice(
          failed ? `뉴스레터를 보냈습니다. 실패 ${failed}건은 기록에서 확인하세요.` : '뉴스레터를 모두 보냈습니다.',
        );
        return;
      }
      if (result.exhausted) {
        setInfo(limitHit);
        return;
      }
      // Nothing moved: another admin is sending this batch. Wait a little, then give up after a few tries.
      if (!result.sent && !result.failed) {
        if (++idle >= 4) throw new Error('다른 관리자가 보내는 중인 것 같습니다. 잠시 후 이어서 보내기를 눌러주세요.');
        await wait(2000);
      } else idle = 0;
    }
  }
  const prepare = () =>
    guarded(async () => {
      const { id } = await api<{ id: string }>('/api/admin/newsletters', { subject: subject.trim(), html });
      const ok = window.confirm(
        `수신 회원 ${overview?.subscribers ?? 0}명에게 보냅니다. 오늘 남은 한도: ${limitText(overview?.remaining ?? null)}`,
      );
      if (!ok) {
        setInfo('발송을 멈췄습니다. 아래 기록에서 이어서 보내거나 삭제할 수 있습니다.');
        return;
      }
      setSubject('');
      setHtml('');
      await deliver(id);
    });
  const resume = (item: Newsletter) =>
    guarded(async () => {
      if (
        !window.confirm(
          `‘${item.subject}’ 남은 ${item.pending}명에게 이어서 보냅니다. 오늘 남은 한도: ${limitText(overview?.remaining ?? null)}`,
        )
      )
        return;
      await deliver(item.id, { sent: item.sent, failed: item.failed });
    });
  const remove = (item: Newsletter) =>
    guarded(async () => {
      if (!window.confirm(`‘${item.subject}’ 뉴스레터를 삭제할까요?`)) return;
      await api(`/api/admin/newsletters/${item.id}`, {}, 'DELETE');
      onNotice('뉴스레터를 삭제했습니다.');
    });

  const configured = overview?.configured ?? false;
  const tooLarge = html.length > maxHtml;
  const ready = configured && !!subject.trim() && !!html.trim() && !tooLarge && !busy;
  return (
    <section className="newsletter-panel" aria-labelledby="newsletter-title">
      <header className="newsletter-head">
        <h2 id="newsletter-title">
          <Mail size={20} />
          뉴스레터
        </h2>
        {overview && (
          <p>
            수신 회원 <strong>{overview.subscribers}명</strong> · 오늘 남은 발송 한도{' '}
            <strong>{limitText(overview.remaining)}</strong>
          </p>
        )}
      </header>
      {loadError && (
        <div className="error-box" role="alert">
          {loadError}
          <button onClick={() => void load()}>다시 시도</button>
        </div>
      )}
      {overview && !configured && (
        <p className="review-confirm">
          발송 설정이 필요합니다 (<a href="/help#admin-newsletter">도움말</a> 참고)
        </p>
      )}

      <div className="newsletter-compose">
        <label>
          제목
          <input value={subject} maxLength={150} onChange={(event) => setSubject(event.target.value)} />
        </label>
        <label>
          HTML 코드
          <small>
            HTML 파일을 불러오거나 코드를 붙여넣으세요. 앞에 붙은 설명 줄은 자동으로 정리됩니다.{' '}
            <span className={tooLarge ? 'danger-text-inline' : undefined}>
              ({html.length.toLocaleString('ko-KR')} / {maxHtml.toLocaleString('ko-KR')}자
              {tooLarge && ' · 뉴스레터 HTML이 너무 큽니다'})
            </span>
          </small>
          <textarea
            value={html}
            rows={6}
            spellCheck={false}
            className="newsletter-source"
            onChange={(event) => setHtml(event.target.value)}
            onPaste={(event) => {
              if (html.trim()) return;
              event.preventDefault();
              applySource(event.clipboardData.getData('text'));
            }}
          />
        </label>
        <label className="secondary newsletter-file">
          <Upload size={16} />
          HTML 파일 불러오기
          <input
            type="file"
            accept=".html,.htm"
            onChange={(event) => {
              readFile(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
        </label>
      </div>

      {html.trim() && (
        <div className="newsletter-preview">
          <div className="newsletter-preview-bar">
            <strong>미리보기</strong>
            <div className="review-tabs" role="tablist" aria-label="미리보기 너비">
              <button
                role="tab"
                aria-selected={!mobile}
                className={mobile ? '' : 'active'}
                onClick={() => setMobile(false)}
              >
                <Monitor size={14} /> PC
              </button>
              <button
                role="tab"
                aria-selected={mobile}
                className={mobile ? 'active' : ''}
                onClick={() => setMobile(true)}
              >
                <Smartphone size={14} /> 모바일
              </button>
            </div>
          </div>
          {/* Empty sandbox: no scripts, no same-origin access to the admin page. */}
          <iframe
            title="뉴스레터 미리보기"
            sandbox=""
            srcDoc={html}
            className={mobile ? 'newsletter-frame mobile' : 'newsletter-frame'}
          />
        </div>
      )}

      {progress && (
        <p className="form-success" role="status">
          보냄 {progress.sent} / 전체 {progress.total}
          {progress.failed > 0 && `, 실패 ${progress.failed}`}
        </p>
      )}
      {info && (
        <p className="review-confirm" role="status">
          {info}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="review-actions">
        <button className="secondary" disabled={!ready} onClick={() => void sendTest()}>
          <Mail size={16} />
          나에게 테스트 발송
        </button>
        <button className="primary" disabled={!ready} onClick={() => void prepare()}>
          <Send size={16} />
          {busy && progress ? '보내는 중…' : '발송 준비'}
        </button>
      </div>

      {overview && overview.newsletters.length > 0 && (
        <>
          <h3 className="newsletter-history-title">보낸 뉴스레터</h3>
          <ul className="newsletter-history">
            {overview.newsletters.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{item.subject}</strong>
                  <small>
                    {formatDate(item.sent_at || item.created_at)} · {item.created_by_name || '이름 없음'} · 보냄{' '}
                    {item.sent} / 전체 {item.total}
                    {item.failed > 0 && ` · 실패 ${item.failed}`}
                    {item.pending > 0 && ` · 남음 ${item.pending}`}
                  </small>
                </div>
                <div className="newsletter-history-actions">
                  {item.pending > 0 && (
                    <button className="secondary" disabled={busy || !configured} onClick={() => void resume(item)}>
                      이어서 보내기
                    </button>
                  )}
                  {item.sent === 0 && (
                    <button className="danger-text" disabled={busy} onClick={() => void remove(item)}>
                      <Trash2 size={15} />
                      삭제
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
