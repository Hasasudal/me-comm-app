'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Check, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react';
import { api } from '../../api-client';

type Session = { admin: boolean; signedIn: boolean; configured: boolean; email?: string; displayName?: string };

export default function AdminJoin() {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  useEffect(() => {
    let active = true;
    api<Session>('/api/session')
      .then((data) => {
        if (!active) return;
        setSession(data);
        if (data.admin) window.location.replace('/admin');
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      await api('/api/admin/join', { code: form.get('code') });
      setSuccess(true);
      setTimeout(() => window.location.assign('/admin'), 700);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="admin-join-page">
      <section className="admin-join-card">
        <a className="brand admin-join-brand" href="/">
          <span className="brand-mark">
            m<span>·</span>
          </span>
          <span>
            미컴<span className="brand-light">라운지</span>
          </span>
        </a>
        <div className="join-icon">
          <ShieldCheck size={31} />
        </div>
        <p className="eyebrow">ADMIN INVITATION</p>
        <h1>관리자 코드 등록</h1>
        <p className="join-description">
          학과에서 전달받은 코드를 인증하면
          <br />
          현재 계정에 관리자 권한이 등록됩니다.
        </p>
        {!session && !error && <p className="join-state">계정 정보를 확인하고 있습니다…</p>}
        {session && !session.signedIn && (
          <div className="join-action">
            <p>먼저 학교 이메일 계정으로 로그인해주세요.</p>
            <a className="primary full" href="/login?returnTo=/admin/join">
              학교 계정으로 로그인 <ArrowRight size={17} />
            </a>
          </div>
        )}
        {session?.signedIn && !session.configured && (
          <div className="form-error">관리자 코드가 아직 설정되지 않았습니다.</div>
        )}
        {session?.signedIn && session.configured && !session.admin && !success && (
          <form onSubmit={submit}>
            <div className="account-preview">
              <Check size={16} />
              <div>
                <strong>{session.displayName}</strong>
                <small>{session.email}</small>
              </div>
            </div>
            <label>
              관리자 코드
              <div className="code-input">
                <KeyRound size={18} />
                <input
                  name="code"
                  type="password"
                  required
                  minLength={12}
                  maxLength={128}
                  autoComplete="off"
                  placeholder="MICOM-XXXX-XXXX-XXXX-XXXX"
                />
              </div>
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="primary full" disabled={busy}>
              {busy ? '인증 중…' : '관리자 권한 등록'}
              <ArrowRight size={17} />
            </button>
          </form>
        )}
        {success && (
          <div className="join-success">
            <Check size={24} />
            <strong>관리자 등록이 완료되었습니다.</strong>
            <p>관리자 페이지로 이동합니다.</p>
          </div>
        )}
        {error && !session && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="join-security">
          <LockKeyhole size={15} />
          관리자 코드는 학과 운영진에게만 공유해주세요.
        </div>
        <a className="back-link join-back" href="/">
          <ArrowLeft size={16} />
          라운지로 돌아가기
        </a>
      </section>
    </main>
  );
}
