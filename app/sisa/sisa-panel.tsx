'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { ArrowRight, ChevronRight, LockKeyhole, Maximize2, Newspaper, Trash2, Upload, X } from 'lucide-react';
import { api } from '../api-client';
import { confirmDialog } from '../confirm-dialog';
import { AppShell, loadSession, type ShellIdentity } from '../app-shell';

// author_name comes to admins only.
type Item = { id: string; title: string; size: number; author_name?: string; created_at: number };
const MAX_BYTES = 10 * 1024 * 1024;
const dateFmt = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});
const size = (n: number) =>
  n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))}KB` : `${(n / 1024 / 1024).toFixed(1)}MB`;

// One component for the list (/sisa) and a single card news (/sisa/<id>), so both share the sign-in gate.
export default function SisaPanel({ id }: { id?: string }) {
  const [identity, setIdentity] = useState<ShellIdentity>({ loaded: false, signedIn: false });
  const [sessionError, setSessionError] = useState('');
  const [items, setItems] = useState<Item[] | null>(null);
  const [item, setItem] = useState<Item | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [wide, setWide] = useState(false);

  const refresh = useCallback(async () => {
    if (id) setItem((await api<{ item: Item }>(`/api/card-news/${id}`)).item);
    else setItems((await api<{ items: Item[] }>('/api/card-news')).items);
  }, [id]);
  useEffect(() => {
    loadSession<ShellIdentity>()
      .then(async (session) => {
        setIdentity({ ...session, loaded: true });
        if (session.signedIn) await refresh().catch((e) => setError((e as Error).message));
      })
      .catch((e) => {
        setSessionError((e as Error).message);
        setIdentity((value) => ({ ...value, loaded: true }));
      });
  }, [refresh]);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const file = data.get('file');
    setUploadError('');
    if (!(file instanceof File) || !file.size) return setUploadError('HTML 파일을 골라주세요.');
    if (file.size > MAX_BYTES) return setUploadError('HTML 파일은 10MB 이하만 올릴 수 있어요.');
    setBusy(true);
    try {
      const { id: created } = await api<{ id: string }>('/api/card-news', {
        title: data.get('title'),
        html: await file.text(),
      });
      window.location.assign(`/sisa/${created}`);
    } catch (e) {
      setUploadError((e as Error).message);
      setBusy(false);
    }
  }

  async function remove(target: Item) {
    if (
      !(await confirmDialog(`“${target.title}” 카드뉴스를 삭제할까요? 되돌릴 수 없어요.`, { ok: '삭제', danger: true }))
    )
      return;
    setError('');
    try {
      await api(`/api/card-news/${target.id}`, {}, 'DELETE');
      if (id) window.location.assign('/sisa');
      else setItems((list) => (list || []).filter((entry) => entry.id !== target.id));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const raw = item && `/api/card-news/${item.id}/raw`;
  return (
    <AppShell
      active="sisa"
      identity={identity}
      breadcrumb={
        id ? (
          <>
            라운지 <ChevronRight size={14} /> <a href="/sisa">시사 모음집</a> <ChevronRight size={14} />{' '}
            <b>{item?.title || '카드뉴스'}</b>
          </>
        ) : (
          <>
            라운지 <ChevronRight size={14} /> <b>시사 모음집</b>
          </>
        )
      }
    >
      {!id && (
        <section className="page-heading">
          <div>
            <p className="eyebrow">CURRENT AFFAIRS</p>
            <h1>
              시사 모음집<span className="heading-dot">.</span>
            </h1>
            <p>운영진이 정리한 시사 카드뉴스를 모아 볼 수 있어요.</p>
          </div>
        </section>
      )}
      {!identity.loaded ? (
        <div className="loading" role="status">
          계정 정보를 확인하고 있어요…
        </div>
      ) : identity.blocked ? (
        <section className="member-gate" role="alert">
          <div className="member-gate-icon">
            <LockKeyhole size={29} />
          </div>
          <h2>이용할 수 없는 계정입니다</h2>
          <p>{identity.blocked}</p>
        </section>
      ) : sessionError ? (
        <section className="detail-card detail-error" role="alert">
          <h1>계정 정보를 불러오지 못했어요</h1>
          <p>{sessionError}</p>
          <button className="primary" type="button" onClick={() => window.location.reload()}>
            다시 시도
          </button>
        </section>
      ) : !identity.signedIn ? (
        <section className="member-gate">
          <div className="member-gate-icon">
            <LockKeyhole size={29} />
          </div>
          <p className="eyebrow">SCHOOL MEMBERS ONLY</p>
          <h2>로그인한 뒤 볼 수 있어요</h2>
          <div>
            <a className="primary" href={`/login?returnTo=${id ? `/sisa/${id}` : '/sisa'}`}>
              로그인 <ArrowRight size={17} />
            </a>
            <a className="secondary" href="/signup">
              회원가입
            </a>
          </div>
        </section>
      ) : error && !items && !item ? (
        <section className="detail-card detail-error" role="alert">
          <h1>카드뉴스를 불러오지 못했어요</h1>
          <p>{error}</p>
          <a className="secondary" href="/sisa">
            목록으로
          </a>
        </section>
      ) : id ? (
        !item || !raw ? (
          <div className="loading" role="status">
            불러오는 중…
          </div>
        ) : (
          <article className={wide ? 'sisa-view wide' : 'sisa-view'}>
            <header className="sisa-view-head">
              <div>
                <h1>{item.title}</h1>
                <p>
                  {item.author_name || '운영진'} · {dateFmt.format(item.created_at)}
                </p>
              </div>
              <div className="sisa-view-actions">
                <button type="button" className="secondary" onClick={() => setWide(true)}>
                  <Maximize2 size={16} /> 크게 보기
                </button>
                {identity.admin && (
                  <button type="button" className="secondary danger" onClick={() => void remove(item)}>
                    <Trash2 size={16} /> 삭제
                  </button>
                )}
              </div>
            </header>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            {wide && (
              <button
                type="button"
                className="sisa-close icon-button"
                aria-label="크게 보기 닫기"
                onClick={() => setWide(false)}
              >
                <X size={20} />
              </button>
            )}
            {/* The response also carries a CSP sandbox; the raw URL itself only loads as a frame (see its route). */}
            <iframe
              className="sisa-frame"
              title={item.title}
              src={raw}
              sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
              referrerPolicy="no-referrer"
            />
          </article>
        )
      ) : (
        <div className="sisa">
          {identity.admin && (
            <form className="sisa-upload" onSubmit={upload}>
              <h2>
                <Upload size={18} /> 카드뉴스 올리기
              </h2>
              <label>
                제목
                <input name="title" required maxLength={100} placeholder="예: 11월 둘째 주 시사 정리" />
              </label>
              <label>
                HTML 파일
                <input name="file" type="file" accept=".html,.htm,text/html" required />
                <span className="field-hint">
                  10MB 이하 HTML 파일 하나만 올릴 수 있어요. 사진은 파일 안에 넣거나(base64) https 주소로 연결해주세요.
                </span>
              </label>
              {uploadError && (
                <p className="form-error" role="alert">
                  {uploadError}
                </p>
              )}
              <button className="primary" disabled={busy}>
                {busy ? '올리는 중…' : '올리기'}
              </button>
            </form>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {!items ? (
            <div className="loading" role="status">
              불러오는 중…
            </div>
          ) : items.length ? (
            <ul className="sisa-list">
              {items.map((entry) => (
                <li key={entry.id}>
                  <a href={`/sisa/${entry.id}`}>
                    <Newspaper size={20} />
                    <span>
                      <strong>{entry.title}</strong>
                      <small>
                        {dateFmt.format(entry.created_at)} · {entry.author_name || '운영진'}
                        {identity.admin && ` · ${size(entry.size)}`}
                      </small>
                    </span>
                  </a>
                  {identity.admin && (
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`${entry.title} 삭제`}
                      onClick={() => void remove(entry)}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <section className="empty-state">
              <h3>아직 올라온 카드뉴스가 없어요</h3>
              <p>운영진이 카드뉴스를 올리면 여기에 모여요.</p>
            </section>
          )}
        </div>
      )}
    </AppShell>
  );
}
