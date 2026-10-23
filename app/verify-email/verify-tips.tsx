'use client';

import { useEffect, useState } from 'react';
import { sendEmailVerification } from 'firebase/auth';
import { firebaseAuth } from '../firebase-client';
import { firebaseMessage, MAIL_SENDER, verifyEmail } from '../auth/firebase-errors';

// Where the link went and how to find it; the address comes from this tab's sign-up.
export default function VerifyTips() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setEmail(verifyEmail()), 0);
    return () => clearTimeout(timer);
  }, []);
  // Sign-up leaves the new Firebase user signed in (local persistence), so resending needs no trip to /login.
  async function resend() {
    setBusy(true);
    setNotice('');
    setError('');
    try {
      const auth = await firebaseAuth();
      await auth.authStateReady();
      if (!auth.currentUser) {
        setError('이 기기에서 로그인이 풀렸어요. 로그인 화면에서 로그인한 뒤 ‘인증 메일 다시 보내기’를 눌러주세요.');
        return;
      }
      await sendEmailVerification(auth.currentUser, {
        url: `${window.location.origin}/login?verified=1`,
        handleCodeInApp: false,
      });
      setNotice('인증 메일을 다시 보냈어요. 스팸함도 함께 확인해주세요.');
    } catch (cause) {
      setError(firebaseMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="verify-panel">
      {email && (
        <p className="verify-sent">
          <strong>{email}</strong>(으)로 인증 메일을 보냈어요. 주소가 틀렸다면 운영진에게 알려주세요.
        </p>
      )}
      <strong>인증 메일이 보이지 않나요?</strong>
      <ol className="verify-steps">
        <li>메일이 도착하기까지 몇 분 걸릴 수 있어요.</li>
        <li>
          학교 메일의 <b>스팸 메일함</b>과 <b>스팸 격리함(차단 메일함)</b>을 확인하고, 보낸사람{' '}
          <code>{MAIL_SENDER}</code> 또는 “firebaseapp”으로 검색해 보세요.
        </li>
        <li>
          그래도 없으면 <b>다시 가입하지 말고</b> 아래 <b>인증 메일 다시 보내기</b>를 눌러주세요.
        </li>
        <li>
          메일이 끝내 오지 않아도 괜찮아요. 로그인하면 <b>운영진 승인 요청</b>이 자동으로 접수되고, 운영진이 본인 확인
          후 승인하면 이용할 수 있어요.
        </li>
      </ol>
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
      <button className="secondary full" type="button" disabled={busy} onClick={() => void resend()}>
        {busy ? '보내는 중…' : '인증 메일 다시 보내기'}
      </button>
      <a className="primary full" href="/login">
        로그인 화면으로 이동
      </a>
    </div>
  );
}
