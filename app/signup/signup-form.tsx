'use client';

import { createUserWithEmailAndPassword, sendEmailVerification, updateProfile } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { firebaseAuth } from '../firebase-client';
import { firebaseMessage, isSchoolEmail, normalizeSchoolEmail } from '../auth/firebase-errors';

export default function SignupForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const data = new FormData(event.currentTarget);
    const name = String(data.get('name') || '').trim();
    const email = normalizeSchoolEmail(String(data.get('email') || ''));
    const password = String(data.get('password') || '');
    const confirm = String(data.get('confirm') || '');
    if (name.length < 2 || name.length > 40) return setError('이름은 2자 이상 40자 이내로 입력해주세요.');
    if (!isSchoolEmail(email)) return setError('경성대학교 이메일(@ks.ac.kr)을 입력해주세요.');
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) return setError('비밀번호는 영문과 숫자를 포함해 8자 이상 입력해주세요.');
    if (password !== confirm) return setError('비밀번호 확인이 일치하지 않습니다.');
    setBusy(true);
    try {
      const auth = await firebaseAuth();
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(credential.user, { displayName: name });
      await sendEmailVerification(credential.user, {
        url: `${window.location.origin}/login?verified=1`,
        handleCodeInApp: false,
      });
      router.push('/verify-email');
    } catch (cause) {
      setError(firebaseMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={submit} noValidate>
      <label>이름<input name="name" autoComplete="name" maxLength={40} required placeholder="실명을 입력해주세요" /></label>
      <label>학교 이메일<div className="email-field"><input name="email" type="email" autoComplete="email" required placeholder="student" /><span>@ks.ac.kr</span></div></label>
      <label>비밀번호<input name="password" type="password" autoComplete="new-password" minLength={8} required placeholder="영문·숫자 포함 8자 이상" /></label>
      <label>비밀번호 확인<input name="confirm" type="password" autoComplete="new-password" minLength={8} required placeholder="비밀번호를 다시 입력해주세요" /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary full" disabled={busy}>{busy ? '가입 중…' : '인증 메일 받고 가입하기'}</button>
      <p className="auth-help">가입 후 학교 메일함에서 인증 링크를 눌러야 로그인이 완료됩니다.</p>
    </form>
  );
}
