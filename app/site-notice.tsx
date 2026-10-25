'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, Mail, X } from 'lucide-react';

// Site-wide notices shown above every page, in order. Remove an entry to take it down; change its `id` to show it
// again to people who closed the old one. `audience` limits a notice to signed-out visitors ('guest') or signed-in
// members ('member'). `info` uses the calm blue style instead of the red warning one.
const SITE_NOTICES: { id: string; title: string; body: ReactNode; info?: boolean; audience?: 'guest' | 'member' }[] = [
  {
    id: 'verify-mail-2026-09',
    title: '인증 메일이 오지 않나요?',
    body: '학교 메일에서 인증 메일이 걸러지는 경우가 있어요. 스팸 메일함·스팸 격리함을 확인하고, 그래도 없으면 가입한 이메일로 로그인만 해두세요. 관리자가 확인 후 승인해 드려요.',
    audience: 'guest',
  },
  {
    id: 'newsletter-2026-10',
    title: '학과 뉴스레터를 보내 드려요',
    body: (
      <>
        앞으로 미컴 라운지 뉴스레터가 가입한 학교 이메일로 발송됩니다. 받고 싶지 않다면 <a href="/account">계정 설정</a>
        에서 끄거나, 메일 아래의 ‘뉴스레터 받지 않기’를 누르면 됩니다.
      </>
    ),
    info: true,
    audience: 'member',
  },
];

const closedKey = (id: string) => `micom:notice-closed:${id}`;
// Not in SITE_NOTICES: it depends on the member's own account, and closing it only lasts for this browser session.
const UNVERIFIED_KEY = 'micom:notice-closed:email-unverified';

// `auth` is the login/sign-up/account card: only the sign-up help shows there, under the form, so the form stays
// on the first screen (the account page has its own verification hint).
export default function SiteNotice({ className = '', auth = false }: { className?: string; auth?: boolean }) {
  const [closed, setClosed] = useState<string[] | null>(null);
  // null until /api/session answers, so guest-only notices never flash at members.
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  // The signed-in member's address when it was never verified (admin-approved), until they close the notice.
  const [unverified, setUnverified] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    fetch('/api/session', { cache: 'no-store' })
      .then((response) =>
        (response.json() as Promise<{ signedIn?: boolean; emailVerified?: boolean; email?: string }>).catch(() => ({
          signedIn: false,
        })),
      )
      .then((data) => {
        if (!active) return;
        setSignedIn(!!data.signedIn);
        if (data.signedIn && 'emailVerified' in data && data.emailVerified === false) {
          try {
            if (sessionStorage.getItem(UNVERIFIED_KEY) === '1') return;
          } catch {}
          setUnverified(data.email || '');
        }
      })
      .catch(() => active && setSignedIn(false));
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    // Read after hydration so the server and first client render agree.
    const timer = setTimeout(() => {
      try {
        setClosed(SITE_NOTICES.filter((n) => localStorage.getItem(closedKey(n.id)) === '1').map((n) => n.id));
      } catch {
        setClosed([]);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  if (!closed) return null;
  function close(id: string) {
    setClosed((ids) => [...(ids ?? []), id]);
    try {
      localStorage.setItem(closedKey(id), '1');
    } catch {}
  }
  return [
    ...(unverified !== null && !auth
      ? [
          <div key="email-unverified" className={`site-notice ${className}`} role="note">
            <AlertTriangle size={18} aria-hidden="true" />
            <p>
              <strong>학교 이메일 인증이 아직 안 됐어요.</strong> 가입한 주소 {unverified}이(가) 실제로 쓰는 학교 메일이
              맞는지 확인해주세요. 메일이 전달되지 않을 수 있어 뉴스레터와 안내 메일을 못 받을 수 있어요. 주소가 다르면{' '}
              <a href="/account">계정 설정</a>에서 바꾸고, 맞다면 인증 메일을 다시 받아 링크를 눌러주세요.
            </p>
            <button
              type="button"
              aria-label="이메일 인증 안내 닫기"
              title="닫기"
              onClick={() => {
                setUnverified(null);
                try {
                  sessionStorage.setItem(UNVERIFIED_KEY, '1');
                } catch {}
              }}
            >
              <X size={16} />
            </button>
          </div>,
        ]
      : []),
    ...SITE_NOTICES.filter(
      (n) =>
        !closed.includes(n.id) &&
        (n.audience === 'guest' ? signedIn === false : n.audience === 'member' ? signedIn === true && !auth : true),
    ).map((n) => (
      <div key={n.id} className={`site-notice ${n.info ? 'info' : ''} ${className}`} role="note">
        {n.info ? <Mail size={18} aria-hidden="true" /> : <AlertTriangle size={18} aria-hidden="true" />}
        <p>
          <strong>{n.title}</strong> {n.body}
        </p>
        <button type="button" aria-label={`‘${n.title}’ 안내 닫기`} title="닫기" onClick={() => close(n.id)}>
          <X size={16} />
        </button>
      </div>
    )),
  ];
}
