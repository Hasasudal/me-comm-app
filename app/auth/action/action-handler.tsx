'use client';

import { applyActionCode, checkActionCode, confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { firebaseAuth } from '../../firebase-client';
import { firebaseMessage } from '../firebase-errors';

export type ActionMode = 'verifyEmail' | 'resetPassword' | 'recoverEmail';

function returnPath(value: string) {
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/auth/')) return '/login';
  return value;
}

export default function ActionHandler({ mode, oobCode, continueUrl }: { mode: ActionMode | null; oobCode: string; continueUrl: string }) {
  const [busy, setBusy] = useState(Boolean(mode && oobCode));
  const [error, setError] = useState(!mode || !oobCode ? '올바르지 않은 요청입니다. 이메일의 링크를 다시 확인해주세요.' : '');
  const [done, setDone] = useState(false);
  const [verifiedEmail, setVerifiedEmail] = useState('');
  const destination = returnPath(continueUrl);

  useEffect(() => {
    if (!mode || !oobCode) return;
    if (mode === 'resetPassword') {
      firebaseAuth().then((auth) => verifyPasswordResetCode(auth, oobCode)).then(setVerifiedEmail).catch((cause) => setError(firebaseMessage(cause))).finally(() => setBusy(false));
      return;
    }
    let cancelled = false;
    async function run() {
      try {
        const auth = await firebaseAuth();
        if (mode === 'recoverEmail') await checkActionCode(auth, oobCode);
        await applyActionCode(auth, oobCode);
        if (!cancelled) setDone(true);
      } catch (cause) {
        if (!cancelled) setError(firebaseMessage(cause));
      } finally {
        if (!cancelled) setBusy(false);
      }
    }
    run();
    return () => { cancelled = true; };
  }, [mode, oobCode]);

  async function reset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    const data = new FormData(event.currentTarget);
    const password = String(data.get('password') || '');
    const confirm = String(data.get('confirm') || '');
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) return setError('비밀번호는 영문과 숫자를 포함해 8자 이상 입력해주세요.');
    if (password !== confirm) return setError('비밀번호 확인이 일치하지 않습니다.');
    setBusy(true);
    try {
      const auth = await firebaseAuth();
      await confirmPasswordReset(auth, oobCode, password);
      setDone(true);
    } catch (cause) { setError(firebaseMessage(cause)); }
    finally { setBusy(false); }
  }

  if (!mode || !oobCode) return <div className="action-state error-box" role="alert">{error}</div>;
  if (busy) return <div className="action-state">요청을 확인하고 있습니다…</div>;
  if (done) return <div className="action-state success"><strong>{mode === 'verifyEmail' ? '학교 이메일 인증을 마쳤습니다.' : mode === 'recoverEmail' ? '이메일을 복구했습니다.' : '비밀번호를 변경했습니다.'}</strong><p>이제 학교 계정으로 로그인할 수 있습니다.</p><Link className="primary full" href={destination}>계속하기</Link></div>;

  if (mode === 'resetPassword' && !error) return (
    <form className="auth-form" onSubmit={reset}>
      {verifiedEmail && <p className="action-email">{verifiedEmail}</p>}
      <label>새 비밀번호<input name="password" type="password" autoComplete="new-password" minLength={8} required placeholder="영문·숫자 포함 8자 이상" /></label>
      <label>새 비밀번호 확인<input name="confirm" type="password" autoComplete="new-password" minLength={8} required placeholder="비밀번호를 다시 입력해주세요" /></label>
      <button className="primary full" disabled={busy}>비밀번호 변경</button>
    </form>
  );

  return <div className="action-state error-box" role="alert">{error || '요청을 처리하지 못했습니다. 링크를 다시 확인해주세요.'}</div>;
}
