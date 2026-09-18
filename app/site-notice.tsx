'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

// Site-wide notice shown above every page. Set SITE_NOTICE to null to take it down; change `id` to show a new
// notice again to people who closed the old one.
const SITE_NOTICE: { id: string; title: string; body: string } | null = {
  id: 'verify-mail-2026-09',
  title: '인증 메일이 오지 않나요?',
  body: '학교 메일에서 인증 메일이 걸러지는 경우가 있어요. 스팸 메일함·스팸 격리함을 확인하고, 그래도 없으면 가입한 이메일로 로그인만 해두세요. 관리자가 확인 후 승인해 드려요.',
};

export default function SiteNotice({ className = '' }: { className?: string }) {
  const [closed, setClosed] = useState(true);
  useEffect(() => {
    // Read after hydration so the server and first client render agree.
    const timer = setTimeout(() => {
      try {
        setClosed(!!SITE_NOTICE && localStorage.getItem(`micom:notice-closed:${SITE_NOTICE.id}`) === '1');
      } catch {
        setClosed(false);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  if (!SITE_NOTICE || closed) return null;
  function close() {
    setClosed(true);
    try {
      localStorage.setItem(`micom:notice-closed:${SITE_NOTICE!.id}`, '1');
    } catch {}
  }
  return (
    <div className={`site-notice ${className}`} role="note">
      <AlertTriangle size={18} aria-hidden="true" />
      <p>
        <strong>{SITE_NOTICE.title}</strong> {SITE_NOTICE.body}
      </p>
      <button type="button" aria-label="안내 닫기" title="닫기" onClick={close}>
        <X size={16} />
      </button>
    </div>
  );
}
