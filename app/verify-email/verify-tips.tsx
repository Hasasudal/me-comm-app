'use client';

import { useEffect, useState } from 'react';
import { MAIL_SENDER, verifyEmail } from '../auth/firebase-errors';

// Where the link went and how to find it; the address comes from this tab's sign-up.
export default function VerifyTips() {
  const [email, setEmail] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setEmail(verifyEmail()), 0);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div className="verify-panel">
      {email && (
        <p className="verify-sent">
          <strong>{email}</strong>(으)로 인증 메일을 보냈습니다. 주소가 틀렸다면 관리자에게 알려주세요.
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
          그래도 없으면 <b>다시 가입하지 말고</b> 로그인 화면에서 로그인한 뒤 <b>인증 메일 다시 보내기</b>를 눌러주세요.
        </li>
        <li>
          메일이 끝내 오지 않아도 괜찮아요. 로그인하면 <b>관리자 승인 요청</b>이 자동으로 접수되고, 관리자가 본인 확인
          후 승인하면 이용할 수 있어요.
        </li>
      </ol>
      <a className="primary full" href="/login">
        로그인 화면으로 이동
      </a>
    </div>
  );
}
