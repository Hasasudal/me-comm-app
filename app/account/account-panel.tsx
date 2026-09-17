'use client';

import { deleteUser, sendPasswordResetEmail, updateProfile, verifyBeforeUpdateEmail } from 'firebase/auth';
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api-client';
import { firebaseAuth } from '../firebase-client';
import { firebaseMessage, isSchoolEmail } from '../auth/firebase-errors';

type Session = { signedIn: boolean; email?: string; displayName?: string };

export default function AccountPanel() {
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    api<Session>('/api/session')
      .then(setSession)
      .catch(() => setError('계정 정보를 불러오지 못했습니다.'));
  }, []);
  async function currentUser() {
    const auth = await firebaseAuth();
    await auth.authStateReady();
    if (!auth.currentUser) throw new Error('보안을 위해 다시 로그인해주세요.');
    return { auth, user: auth.currentUser };
  }
  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const name = String(new FormData(event.currentTarget).get('name') || '').trim();
      if (name.length < 2 || name.length > 40) throw new Error('이름은 2자 이상 40자 이내로 입력해주세요.');
      const { user } = await currentUser();
      await updateProfile(user, { displayName: name });
      const idToken = await user.getIdToken(true);
      const result = await api<{ displayName: string }>('/api/account', { idToken }, 'PATCH');
      setSession((current) => (current ? { ...current, displayName: result.displayName } : current));
      setNotice('이름을 변경했습니다.');
    } catch (cause) {
      setError(firebaseMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function changeEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const email = String(new FormData(event.currentTarget).get('email') || '')
        .trim()
        .toLowerCase();
      if (!isSchoolEmail(email)) throw new Error('경성대학교 이메일(@ks.ac.kr)을 입력해주세요.');
      const { user } = await currentUser();
      await verifyBeforeUpdateEmail(user, email, {
        url: `${window.location.origin}/login?verified=1`,
        handleCodeInApp: false,
      });
      setNotice('새 학교 이메일로 확인 링크를 보냈습니다. 확인 후 다시 로그인해주세요.');
    } catch (cause) {
      setError(firebaseMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function resetPassword() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const { auth, user } = await currentUser();
      if (!user.email) throw new Error('계정 이메일을 확인할 수 없습니다.');
      await sendPasswordResetEmail(auth, user.email, {
        url: `${window.location.origin}/login`,
        handleCodeInApp: false,
      });
      setNotice('비밀번호 재설정 메일을 보냈습니다.');
    } catch (cause) {
      setError(firebaseMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function remove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const confirm = String(new FormData(event.currentTarget).get('confirm') || '');
      await api('/api/account', { confirm, dryRun: true }, 'DELETE');
      const { user } = await currentUser();
      await deleteUser(user);
      await api('/api/account', { confirm }, 'DELETE');
      window.location.assign('/');
    } catch (cause) {
      setError(firebaseMessage(cause));
      setBusy(false);
    }
  }
  if (!session) return <p className="join-state">계정 정보를 확인하고 있습니다…</p>;
  if (!session.signedIn)
    return (
      <div className="join-action">
        <p>계정 관리는 로그인 후 이용할 수 있습니다.</p>
        <a className="primary full" href="/login?returnTo=/account">
          로그인
        </a>
      </div>
    );
  return (
    <div className="account-panel">
      <div className="account-summary">
        <strong>{session.displayName}</strong>
        <span>{session.email}</span>
      </div>
      <form className="account-section" onSubmit={saveName}>
        <h2>이름 변경</h2>
        <label>
          이름
          <input name="name" defaultValue={session.displayName} minLength={2} maxLength={40} required />
        </label>
        <button className="secondary full" disabled={busy}>
          이름 저장
        </button>
      </form>
      <form className="account-section" onSubmit={changeEmail}>
        <h2>학교 이메일 변경</h2>
        <label>
          새 학교 이메일
          <input name="email" type="email" defaultValue={session.email} required />
        </label>
        <button className="secondary full" disabled={busy}>
          확인 메일 보내기
        </button>
      </form>
      <section className="account-section">
        <h2>비밀번호</h2>
        <button className="secondary full" type="button" disabled={busy} onClick={() => void resetPassword()}>
          비밀번호 재설정 메일 받기
        </button>
      </section>
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
      <form className="account-section danger-zone" onSubmit={remove}>
        <h2>회원 탈퇴</h2>
        <p>게시글은 유지되며 계정과 관리자 권한, 로그인 세션이 삭제됩니다.</p>
        <label>
          확인을 위해 ‘회원탈퇴’ 입력
          <input name="confirm" required autoComplete="off" />
        </label>
        <button className="danger full" disabled={busy}>
          {busy ? '처리 중…' : '계정 삭제'}
        </button>
      </form>
    </div>
  );
}
