'use client';

import { sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { useSearchParams } from 'next/navigation';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { firebaseAuth, safeReturnTo } from '../firebase-client';
import { firebaseMessage, isSchoolEmail, MAIL_SENDER, normalizeSchoolEmail } from '../auth/firebase-errors';

export default function LoginForm() {
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(params.get('verified') ? '이메일 인증을 마쳤다면 로그인해주세요.' : '');
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const flash = sessionStorage.getItem('micom:flash');
        if (!flash) return;
        sessionStorage.removeItem('micom:flash');
        setNotice(flash);
      } catch {}
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  const [unverified, setUnverified] = useState(false);
  const [email, setEmail] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    setUnverified(false);
    const data = new FormData(event.currentTarget);
    const inputEmail = normalizeSchoolEmail(String(data.get('email') || ''));
    const password = String(data.get('password') || '');
    if (!isSchoolEmail(inputEmail)) return setError('경성대학교 이메일(@ks.ac.kr)을 입력해주세요.');
    setBusy(true);
    try {
      const auth = await firebaseAuth();
      const credential = await signInWithEmailAndPassword(auth, inputEmail, password);
      await credential.user.reload();
      // Unverified accounts still go to the server: it records an approval request for an admin to review.
      setUnverified(!credential.user.emailVerified);
      const idToken = await credential.user.getIdToken(true);
      const response = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }).catch(() => {
        throw new TypeError('network');
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        // Pending approval (403 without a suspension) is not a failure: show it as information.
        if (response.status === 403 && body.error?.includes('승인을 기다리고')) {
          setNotice(body.error);
          return;
        }
        throw new Error(body.error || '로그인하지 못했어요. 잠시 후 다시 시도해주세요.');
      }
      window.location.assign(safeReturnTo(params.get('returnTo')));
    } catch (cause) {
      setError(firebaseMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    setError('');
    try {
      const auth = await firebaseAuth();
      if (!auth.currentUser) throw new Error('이메일과 비밀번호로 먼저 로그인한 뒤 다시 눌러주세요.');
      await sendEmailVerification(auth.currentUser, {
        url: `${window.location.origin}/login?verified=1`,
        handleCodeInApp: false,
      });
      setError('');
      setNotice(`인증 메일을 다시 보냈어요. 보낸사람 ${MAIL_SENDER} 메일을 스팸함·스팸 격리함에서도 찾아보세요.`);
    } catch (cause) {
      setError(firebaseMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    setError('');
    const schoolEmail = normalizeSchoolEmail(email);
    if (!isSchoolEmail(schoolEmail)) {
      emailRef.current?.focus();
      return setError('비밀번호를 재설정할 학교 이메일을 입력해주세요.');
    }
    setBusy(true);
    try {
      const auth = await firebaseAuth();
      await sendPasswordResetEmail(auth, schoolEmail, {
        url: `${window.location.origin}/login`,
        handleCodeInApp: false,
      });
      setNotice('가입 여부와 관계없이 요청을 접수했어요. 메일함을 확인해주세요.');
    } catch (cause) {
      // Firebase errors other than network/rate-limit look the same to the user (no account lookup);
      // errors without a code (e.g. sign-in not configured) are shown as they are.
      const code = typeof cause === 'object' && cause && 'code' in cause ? String(cause.code) : '';
      if (!code || code === 'auth/network-request-failed' || code === 'auth/too-many-requests')
        setError(firebaseMessage(cause));
      else setNotice('가입 여부와 관계없이 요청을 접수했어요. 메일함을 확인해주세요.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={submit} noValidate>
      <label>
        학교 이메일
        <div className="email-field">
          <input
            ref={emailRef}
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            placeholder="student"
          />
          <span>@ks.ac.kr</span>
        </div>
      </label>
      <label>
        비밀번호
        <div className="email-field">
          <input
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            placeholder="비밀번호를 입력해주세요"
          />
          <button
            className="password-reset"
            type="button"
            aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
            aria-pressed={showPassword}
            onClick={() => setShowPassword((value) => !value)}
          >
            {showPassword ? '숨기기' : '보기'}
          </button>
        </div>
      </label>
      <button className="password-reset" type="button" disabled={busy} onClick={resetPassword}>
        비밀번호 재설정
      </button>
      {notice && (
        <p className="form-success" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {unverified && (
        <button className="secondary full" type="button" disabled={busy} onClick={resend}>
          인증 메일 다시 보내기
        </button>
      )}
      <button className="primary full" disabled={busy}>
        {busy ? '확인 중…' : '로그인'}
      </button>
    </form>
  );
}
