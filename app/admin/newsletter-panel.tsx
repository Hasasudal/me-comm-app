'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarClock, Mail, Monitor, Send, Smartphone, Trash2, Upload } from 'lucide-react';
import { api } from '../api-client';
import { confirmDialog } from '../confirm-dialog';

type Audience = 'all' | 'staff';
type Newsletter = {
  id: string;
  subject: string;
  created_at: number;
  created_by_name: string | null;
  started_by_name: string | null;
  started_at: number | null;
  sent_at: number | null;
  scheduled_at: number | null;
  scheduled_by_name: string | null;
  audience: Audience;
  total: number;
  sent: number;
  failed: number;
  pending: number;
};
type Overview = {
  configured: boolean;
  remaining: number | null;
  subscribers: number;
  audiences: Record<Audience, number>;
  newsletters: Newsletter[];
};
const audienceLabel: Record<Audience, string> = { all: '전체 구독자', staff: '운영진만 (학사·학생회·관리자)' };
const audienceShort: Record<Audience, string> = { all: '수신 회원', staff: '운영진' };
// sent/failed count this batch only; pending is everything still left.
type SendResult = {
  sent: number;
  failed: number;
  pending: number;
  remaining: number | null;
  done: boolean;
  exhausted: boolean;
};
// UTF-8 bytes, same unit as the server's cap.
const maxHtmlBytes = 180_000;
const draftKey = 'micom:newsletter-draft';
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
// datetime-local has no timezone; the picker always means Korea time (UTC+9, no DST), whatever the browser's zone.
const minute = 60_000;
const hour = 60 * minute;
const kstOffset = 9 * hour;
const toKstInput = (ms: number) => new Date(ms + kstOffset).toISOString().slice(0, 16);
const fromKstInput = (value: string) => Date.parse(`${value}Z`) - kstOffset;
const formatKst = (n: number) =>
  new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(n);
// Picker for a new newsletter (id null) or for rescheduling a history item.
type Scheduling = { id: string | null; value: string };
const limitText = (remaining: number | null) => (remaining === null ? '확인 불가' : `${remaining}명`);
const limitHit = '오늘 발송 한도를 다 썼어요. 내일 이어서 보내주세요.';

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
  // Narrow screens preview the mobile width by default.
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 700);
  const [draftReady, setDraftReady] = useState(false);
  const [restored, setRestored] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [scheduling, setScheduling] = useState<Scheduling | null>(null);
  const [audience, setAudience] = useState<Audience>('all');
  const [testTo, setTestTo] = useState('');
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

  // Restore the composer from this browser once, then keep saving it (the HTML is skipped when over the size cap).
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(draftKey) || 'null') as { subject?: string; html?: string } | null;
        if (saved && (saved.subject || saved.html)) {
          setSubject(String(saved.subject || '').slice(0, 150));
          setHtml(String(saved.html || ''));
          setRestored(true);
        }
      } catch {}
      setDraftReady(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!draftReady) return;
    try {
      if ((!subject && !html) || new TextEncoder().encode(html).length > maxHtmlBytes) localStorage.removeItem(draftKey);
      else localStorage.setItem(draftKey, JSON.stringify({ subject, html }));
    } catch {}
  }, [draftReady, subject, html]);

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
    reader.onerror = () => setError('파일을 읽지 못했어요. 다시 선택해주세요.');
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
      // Includes the 502 "결과를 확인하지 못했어요" case: the loop stops here and load() below shows the failed count.
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
      const result = await api<{ ok: boolean; remaining: number | null; count: number }>('/api/admin/newsletters/test', {
        subject: subject.trim(),
        html,
        to: testTo,
      });
      setOverview((current) => (current ? { ...current, remaining: result.remaining } : current));
      onNotice(result.count > 1 ? `테스트 메일을 ${result.count}명에게 보냈어요.` : '내 이메일로 테스트 메일을 보냈어요.');
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
          failed ? `뉴스레터를 보냈어요. 실패 ${failed}건은 기록에서 확인해주세요.` : '뉴스레터를 모두 보냈어요.',
        );
        return;
      }
      if (result.exhausted) {
        setInfo(limitHit);
        return;
      }
      // Nothing moved: another admin is sending this batch. Wait a little, then give up after a few tries.
      if (!result.sent && !result.failed) {
        if (++idle >= 4) throw new Error('다른 관리자가 보내는 중인 것 같아요. 잠시 후 이어서 보내기를 눌러주세요.');
        await wait(2000);
      } else idle = 0;
    }
  }
  const prepare = () =>
    guarded(async () => {
      const ok = await confirmDialog(
        `${audienceShort[audience]} ${overview?.audiences[audience] ?? 0}명에게 보낼까요? 오늘 남은 한도: ${limitText(overview?.remaining ?? null)}`,
        { ok: '보내기' },
      );
      if (!ok) return;
      const { id } = await api<{ id: string }>('/api/admin/newsletters', { subject: subject.trim(), html, audience });
      setSubject('');
      setHtml('');
      await deliver(id);
    });
  const openPicker = (id: string | null, at?: number | null) => {
    const now = Date.now();
    // Default: the whole hour after next, e.g. 14:20 → 16:00.
    setScheduling({ id, value: toKstInput(at && at > now ? at : Math.floor(now / hour) * hour + 2 * hour) });
  };
  const schedule = (picked: Scheduling) =>
    guarded(async () => {
      const at = fromKstInput(picked.value);
      const now = Date.now();
      if (!Number.isFinite(at) || at < now + 10 * minute || at > now + 60 * 24 * hour) {
        throw new Error('예약 시각을 확인해주세요. 10분 뒤부터 60일 안에서 고를 수 있어요.');
      }
      const item = overview?.newsletters.find((n) => n.id === picked.id);
      const to = item?.audience ?? audience;
      const count = item?.started_at ? item.pending : (overview?.audiences[to] ?? 0);
      const ok = await confirmDialog(
        `${item ? `‘${item.subject}’ ` : ''}${audienceShort[to]} ${count}명에게 ${formatKst(at)}(한국 시간)에 보내도록 예약할까요?\n` +
          '하루 발송 한도를 다 쓰면 다음 날 자동으로 이어서 보내요.',
        { ok: '예약하기' },
      );
      if (!ok) return;
      let id = picked.id;
      if (!id) {
        id = (await api<{ id: string }>('/api/admin/newsletters', { subject: subject.trim(), html, audience })).id;
        setSubject('');
        setHtml('');
        // If scheduling fails now, the picker reopens on the new history row instead of creating a duplicate.
        setScheduling({ id, value: picked.value });
      }
      await api(`/api/admin/newsletters/${id}/schedule`, { at });
      setScheduling(null);
      onNotice(`${formatKst(at)}에 보내도록 예약했어요.`);
    });
  const unschedule = (item: Newsletter) =>
    guarded(async () => {
      const msg = item.started_at
        ? `‘${item.subject}’ 예약을 취소할까요? 이미 보낸 메일은 그대로이고, 남은 ${item.pending}명은 ‘이어서 보내기’를 누를 때까지 기다려요.`
        : `‘${item.subject}’ 예약을 취소할까요? 뉴스레터는 기록에 남아요.`;
      if (!(await confirmDialog(msg, { ok: '예약 취소', cancel: '닫기', danger: true })))
        return;
      await api(`/api/admin/newsletters/${item.id}/schedule`, {}, 'DELETE');
      onNotice('예약을 취소했어요.');
    });
  const resume = (item: Newsletter) =>
    guarded(async () => {
      const limit = `오늘 남은 한도: ${limitText(overview?.remaining ?? null)}`;
      const count = item.started_at ? item.pending : (overview?.audiences[item.audience] ?? 0);
      const who = `${audienceShort[item.audience]} ${count}명`;
      const ok = await confirmDialog(
        item.scheduled_at && !item.started_at
          ? `‘${item.subject}’ 예약을 취소하고 지금 ${who}에게 보낼까요? ${limit}`
          : `‘${item.subject}’ 남은 ${who}에게 이어서 보낼까요? ${limit}`,
        { ok: '보내기' },
      );
      if (!ok) return;
      setScheduling(null);
      await deliver(item.id, { sent: item.sent, failed: item.failed });
    });
  const remove = (item: Newsletter) =>
    guarded(async () => {
      if (!(await confirmDialog(`‘${item.subject}’ 뉴스레터를 삭제할까요?`, { ok: '삭제', danger: true }))) return;
      await api(`/api/admin/newsletters/${item.id}`, {}, 'DELETE');
      onNotice('뉴스레터를 삭제했어요.');
    });

  const configured = overview?.configured ?? false;
  const htmlBytes = new TextEncoder().encode(html).length;
  const tooLarge = htmlBytes > maxHtmlBytes;
  const notReady = !configured
    ? '발송 설정이 필요해요'
    : busy
      ? '처리 중이에요'
      : !subject.trim()
        ? '제목을 먼저 적어주세요'
        : !html.trim()
          ? '본문을 먼저 넣어주세요'
          : tooLarge
            ? '본문이 너무 커요'
            : undefined;
  const ready = configured && !!subject.trim() && !!html.trim() && !tooLarge && !busy;
  const picker = (picked: Scheduling) => {
    const now = Date.now();
    return (
      <div className="newsletter-schedule">
        <label>
          예약 시각 (한국 시간)
          <input
            type="datetime-local"
            value={picked.value}
            min={toKstInput(now + 10 * minute)}
            max={toKstInput(now + 60 * 24 * hour)}
            onChange={(event) => setScheduling({ ...picked, value: event.target.value })}
          />
        </label>
        <button
          className="primary"
          disabled={busy || !configured || !picked.value || (!picked.id && !ready)}
          onClick={() => void schedule(picked)}
        >
          <CalendarClock size={16} />
          예약하기
        </button>
        <button className="secondary" disabled={busy} onClick={() => setScheduling(null)}>
          닫기
        </button>
      </div>
    );
  };
  return (
    <section className="newsletter-panel" aria-labelledby="newsletter-title">
      <header className="newsletter-head">
        <h2 id="newsletter-title">
          <Mail size={20} />
          뉴스레터
        </h2>
        {overview && (
          <ul className="newsletter-stats">
            <li>
              수신 회원 <strong>{overview.subscribers}명</strong>
            </li>
            <li>
              오늘 남은 발송 한도 <strong>{limitText(overview.remaining)}</strong>
            </li>
          </ul>
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
          발송 설정이 필요해요 (<a href="/help#admin-newsletter">도움말</a> 참고)
        </p>
      )}

      {restored && (
        <p className="review-confirm" role="status">
          불러온 임시 내용이에요. 이 브라우저에 자동 저장돼 있었어요.{' '}
          <button
            className="text-button"
            onClick={() => {
              setSubject('');
              setHtml('');
              setRestored(false);
            }}
          >
            비우기
          </button>
        </p>
      )}
      <div className="newsletter-compose">
        <h3 className="newsletter-section-title">새 뉴스레터</h3>
        <label className="newsletter-field">
          <span>제목</span>
          <input value={subject} maxLength={150} onChange={(event) => setSubject(event.target.value)} />
        </label>
        <fieldset className="newsletter-audience">
          <legend>받는 사람</legend>
          {(Object.keys(audienceLabel) as Audience[]).map((value) => (
            <label key={value} className={audience === value ? 'selected' : undefined}>
              <input type="radio" name="newsletter-audience" checked={audience === value} onChange={() => setAudience(value)} />
              <span className="newsletter-audience-name">{audienceLabel[value]}</span>
              {overview && <small>{overview.audiences[value]}명</small>}
            </label>
          ))}
        </fieldset>
        <div className="newsletter-workspace">
          <div className="newsletter-editor">
            <div className="newsletter-toolbar">
              <span id="newsletter-html-label" className="newsletter-field-label">
                HTML 코드
              </span>
              <span className={tooLarge ? 'newsletter-bytes danger-text-inline' : 'newsletter-bytes'}>
                {(htmlBytes / 1000).toFixed(1)}KB / {maxHtmlBytes / 1000}KB
                {tooLarge && ' · 뉴스레터 HTML이 너무 커요'}
              </span>
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
            <textarea
              value={html}
              rows={12}
              spellCheck={false}
              aria-labelledby="newsletter-html-label"
              className="newsletter-source"
              onChange={(event) => setHtml(event.target.value)}
              onPaste={(event) => {
                if (html.trim()) return;
                event.preventDefault();
                applySource(event.clipboardData.getData('text'));
              }}
            />
            <small className="newsletter-hint">
              HTML 파일을 불러오거나 코드를 붙여넣어주세요. 앞에 붙은 설명 줄은 자동으로 정리돼요.
            </small>
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
        </div>
      </div>

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
      <div className="newsletter-actionbar">
      <label className="newsletter-test-to">
        <span>테스트 메일 추가 수신자 (선택)</span>
        <input
          value={testTo}
          maxLength={300}
          placeholder="뉴스레터를 받는 회원 이메일, 쉼표로 구분 (최대 5명)"
          onChange={(event) => setTestTo(event.target.value)}
        />
      </label>
      <div className="review-actions">
        <button className="secondary" disabled={!ready} title={notReady} onClick={() => void sendTest()}>
          <Mail size={16} />
          {testTo.trim() ? '테스트 발송' : '나에게 테스트 발송'}
        </button>
        <button className="secondary" disabled={!ready} title={notReady} onClick={() => openPicker(null)}>
          <CalendarClock size={16} />
          예약 발송
        </button>
        <button className="primary" disabled={!ready} title={notReady} onClick={() => void prepare()}>
          <Send size={16} />
          {busy && progress ? '보내는 중…' : '발송하기'}
        </button>
      </div>
      </div>
      {scheduling && !scheduling.id && picker(scheduling)}

      {overview && overview.newsletters.length > 0 && (
        <>
          <h3 className="newsletter-history-title newsletter-section-title">보낸 뉴스레터</h3>
          <ul className="newsletter-history">
            {overview.newsletters.map((item) => {
              const waiting = !!item.scheduled_at && !item.started_at;
              return (
                <li key={item.id}>
                  <div className="newsletter-history-main">
                    <div className="newsletter-history-title-row">
                      <strong>{item.subject}</strong>
                      {waiting && <span className="status-badge feedback">예약됨</span>}
                      {item.started_at && !item.sent_at && item.pending > 0 && (
                        <span className="status-badge pending">{item.scheduled_at ? '발송 중' : '중단됨'}</span>
                      )}
                      {item.sent_at && <span className="status-badge published">완료</span>}
                      {item.audience === 'staff' && <span className="status-badge">운영진만</span>}
                    </div>
                    {waiting && (
                      <small>
                        예약: {formatKst(item.scheduled_at ?? 0)} (한국 시간) · {item.scheduled_by_name || '이름 없음'}
                      </small>
                    )}
                    <small>
                      {formatDate(item.sent_at || item.created_at)} · {item.created_by_name || '이름 없음'} · 보냄{' '}
                      {item.sent} / 전체 {item.total}
                      {item.failed > 0 && ` · 실패 ${item.failed}`}
                      {item.pending > 0 && ` · 남음 ${item.pending}`}
                    </small>
                    {item.started_at && !item.sent_at && item.total > 0 && (
                      <progress
                        className="newsletter-progress"
                        value={item.sent}
                        max={item.total}
                        aria-label={`발송 진행률 ${item.sent} / ${item.total}`}
                      />
                    )}
                    {item.started_at && (
                      <small>
                        발송 시작: {item.started_by_name || '이름 없음'} · {formatDate(item.started_at)}
                      </small>
                    )}
                    {item.started_at && item.scheduled_at && item.pending > 0 && (
                      <small>한도에 걸리면 다음 날 자동으로 이어서 보내요.</small>
                    )}
                    {scheduling?.id === item.id && picker(scheduling)}
                  </div>
                  <div className="newsletter-history-actions">
                    {item.scheduled_at && !item.sent_at && (
                      <button className="secondary" disabled={busy} onClick={() => void unschedule(item)}>
                        예약 취소
                      </button>
                    )}
                    {/* Unsent drafts can be scheduled too, e.g. when scheduling failed right after creating one. */}
                    {/* Recipients are snapshotted on the first send, so an unstarted newsletter has no pending rows yet. */}
                    {!item.started_at && !item.sent_at && (
                      <button
                        className="secondary"
                        disabled={busy || !configured}
                        onClick={() => openPicker(item.id, item.scheduled_at)}
                      >
                        {waiting ? '시간 변경' : '예약 발송'}
                      </button>
                    )}
                    {(item.pending > 0 || (!item.started_at && !item.sent_at)) && (
                      <button className="secondary" disabled={busy || !configured} onClick={() => void resume(item)}>
                        {waiting ? '지금 보내기' : '이어서 보내기'}
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
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
