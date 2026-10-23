'use client';

import {
  deleteUser,
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signOut,
  updateProfile,
  verifyBeforeUpdateEmail,
} from 'firebase/auth';
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api-client';
import { firebaseAuth } from '../firebase-client';
import { firebaseMessage, isSchoolEmail } from '../auth/firebase-errors';

type Session = { signedIn: boolean; email?: string; displayName?: string; newsletter?: boolean };

export default function AccountPanel() {
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmText, setConfirmText] = useState('');
  useEffect(() => {
    api<Session>('/api/session')
      .then(setSession)
      .catch(() => setError('계정 정보를 불러오지 못했어요. 새로고침한 뒤 다시 시도해주세요.'));
  }, []);
  async function currentUser() {
    const auth = await firebaseAuth();
    await auth.authStateReady();
    if (!auth.currentUser) throw new Error('보안을 위해 다시 로그인이 필요해요. 로그인한 뒤 다시 시도해주세요.');
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
      setNotice('이름을 변경했어요.');
    } catch (cause) {
      setError(firebaseMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function saveNewsletter(newsletter: boolean) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api('/api/account', { newsletter }, 'PATCH');
      setSession((current) => (current ? { ...current, newsletter } : current));
      setNotice(newsletter ? '뉴스레터를 받아요.' : '이제 뉴스레터를 보내지 않아요.');
    } catch (cause) {
      setError((cause as Error).message);
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
      setNotice('새 학교 이메일로 확인 링크를 보냈어요. 링크를 누른 뒤 다시 로그인하면 바뀌어요.');
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
      if (!user.email) throw new Error('계정 이메일을 확인하지 못했어요. 다시 로그인한 뒤 시도해주세요.');
      await sendPasswordResetEmail(auth, user.email, {
        url: `${window.location.origin}/login`,
        handleCodeInApp: false,
      });
      setNotice('비밀번호 재설정 메일을 보냈어요. 메일함을 확인해주세요.');
    } catch (cause) {
      setError(firebaseMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  // Firebase password resets do not end D1 sessions, so members can end every device's session themselves.
  async function signOutEverywhere() {
    if (!window.confirm('이 기기를 포함한 모든 기기에서 로그아웃돼요. 계속할까요?')) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api('/api/auth/session', { all: true }, 'DELETE');
      await signOut(await firebaseAuth()).catch(() => {});
      window.location.assign('/login');
    } catch (cause) {
      setError(firebaseMessage(cause));
      setBusy(false);
    }
  }
  async function remove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    const form = event.currentTarget;
    const data = new FormData(form);
    const passwordInput = form.elements.namedItem('password') as HTMLInputElement | null;
    try {
      const confirm = String(data.get('confirm') || '');
      const password = String(data.get('password') || '');
      if (!password) throw new Error('현재 비밀번호를 입력해주세요.');
      await api('/api/account', { confirm, dryRun: true }, 'DELETE');
      const { user } = await currentUser();
      if (!user.email) throw new Error('계정 이메일을 확인하지 못했어요. 다시 로그인한 뒤 시도해주세요.');
      // Fresh sign-in first: deleteUser rejects stale sessions, and by then the server data would already be gone.
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
      if (passwordInput) passwordInput.value = '';
      // The server checks this token's auth_time to confirm the password was just entered.
      const idToken = await user.getIdToken(true);
      await api('/api/account', { confirm, idToken }, 'DELETE');
      await deleteUser(user);
      window.location.assign('/');
    } catch (cause) {
      if (passwordInput) passwordInput.value = '';
      setError(firebaseMessage(cause));
      setBusy(false);
    }
  }
  if (!session) return <p className="join-state">계정 정보를 확인하고 있어요…</p>;
  if (!session.signedIn)
    return (
      <div className="join-action">
        <p>계정 관리는 로그인한 뒤 이용할 수 있어요.</p>
        <a className="primary full" href="/login?returnTo=/account">
          로그인
        </a>
      </div>
    );
  return (
    <div className="account-panel">
      {(notice || error) && (
        <div style={{ position: 'sticky', top: 8, zIndex: 5 }}>
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
        </div>
      )}
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
        <p className="field-hint">새 학교 이메일로 온 확인 링크를 누른 뒤 다시 로그인하면 바뀌어요.</p>
      </form>
      <section className="account-section">
        <h2>비밀번호</h2>
        <button className="secondary full" type="button" disabled={busy} onClick={() => void resetPassword()}>
          비밀번호 재설정 메일 받기
        </button>
      </section>
      <section className="account-section">
        <h2>뉴스레터</h2>
        <p>학교 이메일로 학과 소식 뉴스레터를 보내드려요. 원하지 않으면 끌 수 있어요.</p>
        <label className="check-row">
          <input
            type="checkbox"
            checked={!!session.newsletter}
            disabled={busy}
            onChange={(event) => void saveNewsletter(event.target.checked)}
          />
          미컴 라운지 뉴스레터 받기
        </label>
      </section>
      <section className="account-section">
        <h2>로그인 세션</h2>
        <p>비밀번호를 바꿨거나 다른 기기에 로그인이 남아 있다면 모든 기기에서 로그아웃해주세요.</p>
        <button className="secondary full" type="button" disabled={busy} onClick={() => void signOutEverywhere()}>
          모든 기기에서 로그아웃
        </button>
      </section>
      <form className="account-section danger-zone" onSubmit={remove}>
        <h2>회원 탈퇴</h2>
        <p>
          글과 댓글은 ‘탈퇴한 회원’ 이름으로 남고, 학사문의·학생회 건의와 검토 중인 뉴스 기사는 삭제돼요. 계정과
          운영 권한, 로그인 정보도 삭제돼요. 본인 확인을 위해 현재 비밀번호가 필요해요.
        </p>
        <label>
          현재 비밀번호
          <input name="password" type="password" required autoComplete="current-password" />
        </label>
        <label>
          확인을 위해 ‘회원탈퇴’ 입력
          <input
            name="confirm"
            required
            autoComplete="off"
            placeholder="회원탈퇴"
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
          />
        </label>
        <button className="danger full" disabled={busy || confirmText.trim() !== '회원탈퇴'}>
          {busy ? '처리 중…' : '계정 삭제'}
        </button>
      </form>
    </div>
  );
}
