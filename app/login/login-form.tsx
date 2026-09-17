'use client';

import { sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { useSearchParams } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { firebaseAuth, safeReturnTo } from '../firebase-client';
import { firebaseMessage, isSchoolEmail, normalizeSchoolEmail } from '../auth/firebase-errors';

export default function LoginForm() {
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(params.get('verified') ? '이메일 인증을 마쳤다면 로그인해주세요.' : '');
  const [unverified, setUnverified] = useState(false);
  const [email, setEmail] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setNotice(''); setUnverified(false);
    const data = new FormData(event.currentTarget);
    const inputEmail = normalizeSchoolEmail(String(data.get('email') || ''));
    const password = String(data.get('password') || '');
    if (!isSchoolEmail(inputEmail)) return setError('경성대학교 이메일(@ks.ac.kr)을 입력해주세요.');
    setBusy(true);
    try {
      const auth = await firebaseAuth();
      const credential = await signInWithEmailAndPassword(auth, inputEmail, password);
      await credential.user.reload();
      if (!credential.user.emailVerified) {
        setUnverified(true);
        return setError('학교 이메일 인증이 필요합니다. 메일함을 확인해주세요.');
      }
      const idToken = await credential.user.getIdToken(true);
      const response = await fetch('/api/auth/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }) });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error || '로그인 세션을 만들지 못했습니다.');
      window.location.assign(safeReturnTo(params.get('returnTo')));
    } catch (cause) {
      setError(firebaseMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true); setError('');
    try {
      const auth = await firebaseAuth();
      if (!auth.currentUser) throw new Error('이메일과 비밀번호로 다시 로그인해주세요.');
      await sendEmailVerification(auth.currentUser, { url: `${window.location.origin}/login?verified=1`, handleCodeInApp: false });
      setNotice('인증 메일을 다시 보냈습니다. 스팸함도 확인해주세요.');
    } catch (cause) { setError(firebaseMessage(cause)); }
    finally { setBusy(false); }
  }

  async function resetPassword() {
    setError('');
    const schoolEmail = normalizeSchoolEmail(email);
    if (!isSchoolEmail(schoolEmail)) return setError('비밀번호를 재설정할 학교 이메일을 입력해주세요.');
    setBusy(true);
    try {
      const auth = await firebaseAuth();
      await sendPasswordResetEmail(auth, schoolEmail, { url: `${window.location.origin}/login`, handleCodeInApp: false });
      setNotice('가입 여부와 관계없이 요청을 접수했습니다. 메일함을 확인해주세요.');
    } catch (cause) {
      const message = firebaseMessage(cause);
      setNotice(message.includes('설정') ? '' : '가입 여부와 관계없이 요청을 접수했습니다. 메일함을 확인해주세요.');
      if (message.includes('설정')) setError(message);
    } finally { setBusy(false); }
  }

  return (
    <form className="auth-form" onSubmit={submit} noValidate>
      <label>학교 이메일<div className="email-field"><input name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="student" /><span>@ks.ac.kr</span></div></label>
      <label>비밀번호<input name="password" type="password" autoComplete="current-password" required placeholder="비밀번호를 입력해주세요" /></label>
      <button className="password-reset" type="button" disabled={busy} onClick={resetPassword}>비밀번호 재설정</button>
      {notice && <p className="form-success" role="status">{notice}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {unverified && <button className="secondary full" type="button" disabled={busy} onClick={resend}>인증 메일 다시 보내기</button>}
      <button className="primary full" disabled={busy}>{busy ? '확인 중…' : '로그인'}</button>
    </form>
  );
}
