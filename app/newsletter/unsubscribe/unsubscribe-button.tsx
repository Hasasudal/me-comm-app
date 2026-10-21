'use client';

import { useState } from 'react';
import { api } from '../../api-client';

// Unsubscribes only on click: mail scanners open links in advance, so loading the page must change nothing.
export default function UnsubscribeButton({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  if (!token)
    return (
      <div className="action-state error-box" role="alert">
        수신 거부 링크가 올바르지 않습니다. 뉴스레터 메일 아래의 ‘뉴스레터 받지 않기’ 링크를 다시 눌러주세요. 로그인한
        뒤 계정 설정에서 끌 수도 있습니다.
      </div>
    );
  if (done)
    return (
      <div className="action-state success" role="status">
        <strong>뉴스레터를 더 이상 보내지 않습니다.</strong>
        <p>다시 받고 싶다면 로그인한 뒤 계정 설정에서 켤 수 있습니다.</p>
        <a className="primary full" href="/">
          홈으로
        </a>
      </div>
    );
  async function unsubscribe() {
    setBusy(true);
    setError('');
    try {
      await api('/api/newsletter/unsubscribe', { token });
      setDone(true);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="primary full" disabled={busy} onClick={() => void unsubscribe()}>
        {busy ? '처리 중…' : '뉴스레터 받지 않기'}
      </button>
    </>
  );
}
