'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowUpRight,
  Bell,
  CircleHelp,
  Inbox,
  Layers3,
  LogOut,
  Megaphone,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  MessageSquare,
  Newspaper,
  DoorOpen,
  Package,
  Settings,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import { api } from './api-client';
import SiteNotice from './site-notice';

export type BoardId = 'all' | 'board' | 'inquiry' | 'complaint' | 'news' | 'clubs' | 'contests';
export const boards = [
  { id: 'all', label: '통합 게시판', href: '/', icon: Layers3, sub: '학과의 모든 이야기를 한곳에서 만나보세요.' },
  {
    id: 'board',
    label: '자유게시판',
    href: '/board',
    icon: MessageSquare,
    sub: '하고 싶은 이야기를 편하게 나눠보세요.',
  },
  {
    id: 'inquiry',
    label: '학사문의',
    href: '/inquiry',
    icon: Inbox,
    sub: '학과 사무실에 1:1로 문의하세요. 나와 학사 담당자만 볼 수 있어요.',
  },
  {
    id: 'complaint',
    label: '학생회 건의',
    href: '/complaint',
    icon: Megaphone,
    sub: '학생회에 건의하거나 불편을 알려주세요. 나와 학생회만 볼 수 있어요.',
  },
  { id: 'news', label: '학과 뉴스', href: '/news', icon: Newspaper, sub: '기사를 제출하고 검토 결과를 확인하세요.' },
  { id: 'clubs', label: '동아리', href: '/clubs', icon: Users, sub: '같은 관심사로 시작하는 새로운 연결.' },
  {
    id: 'contests',
    label: '공모전 모집',
    href: '/contests',
    icon: Trophy,
    sub: '아이디어를 함께 완성할 팀원을 만나보세요.',
  },
] as const;
// Equipment rental and student-council requests run through the 미컴봇 KakaoTalk channel.
// "/chat" opens the chat room straight away (in the KakaoTalk app on phones, as web chat on computers).
const MICOMBOT_URL = 'https://pf.kakao.com/_jaUxiG/chat';
// Rentals live outside the site: equipment on the Notion page, rooms through the 미컴봇 chat.
const rentalLinks = [
  {
    label: '기자재 대여',
    icon: Package,
    href: 'https://mecommbot.notion.site/3113a2e7a7a78123b592d3b83b9666fc?pvs=143',
  },
  { label: '호실 대여', icon: DoorOpen, href: MICOMBOT_URL },
];
export type Role = 'member' | 'academic' | 'council' | 'admin';
export const roleLabels: Record<Role, string> = {
  member: '일반',
  academic: '학사',
  council: '학생회',
  admin: '관리자',
};
// Private boards answered by their staff (or admins): the badge reads [waiting, answered].
export const deskStatus: Partial<Record<BoardId, [string, string]>> = {
  inquiry: ['답변 대기', '답변 완료'],
  complaint: ['처리 대기', '처리 완료'],
};
export const boardLabels = Object.fromEntries(boards.map((b) => [b.id, b.label])) as Record<BoardId, string>;
export const boardPaths = Object.fromEntries(boards.map((b) => [b.id, b.href])) as Record<BoardId, string>;

export type ShellIdentity = {
  loaded: boolean;
  signedIn: boolean;
  userId?: string;
  email?: string;
  displayName?: string;
  newsReviewedAt?: number | null;
  repliedAt?: number | null;
  waiting?: Partial<Record<BoardId, number>>;
  pendingMembers?: number;
  admin?: boolean;
};
type Reply = {
  kind: 'reply' | 'answer' | 'desk' | 'followup' | 'signup';
  id: string;
  post_id: string;
  title: string;
  author_name: string;
  excerpt: string;
  created_at: number;
};
const replyKinds: Record<Reply['kind'], string> = {
  reply: '댓글',
  answer: '답변',
  desk: '새 글',
  followup: '추가 문의',
  signup: '가입 승인',
};

// "Seen" is a per-browser convenience: when the member last looked at review results ("news") or replies.
type SeenKind = 'news' | 'replies';
const seenKey = (kind: SeenKind, userId: string) => `micom:${kind}-seen:${userId}`;
export function seenAt(kind: SeenKind, userId: string) {
  try {
    return Number(localStorage.getItem(seenKey(kind, userId))) || 0;
  } catch {
    return 0;
  }
}
export function markSeen(kind: SeenKind, userId: string) {
  try {
    localStorage.setItem(seenKey(kind, userId), String(Date.now()));
  } catch {}
}
const formatWhen = (n: number) =>
  new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(n);

// Topbar bell: recent comments others left on my posts; opening it marks them seen.
function ReplyBell({ userId, repliedAt }: { userId: string; repliedAt?: number | null }) {
  const [seenBefore, setSeenBefore] = useState(() => seenAt('replies', userId));
  const [open, setOpen] = useState(false);
  const [replies, setReplies] = useState<Reply[] | null>(null);
  const [error, setError] = useState('');
  const fresh = (repliedAt || 0) > seenBefore;

  async function toggle() {
    if (open) {
      setOpen(false);
      setSeenBefore(seenAt('replies', userId));
      return;
    }
    setOpen(true);
    setError('');
    markSeen('replies', userId);
    try {
      setReplies((await api<{ replies: Reply[] }>('/api/notifications')).replies);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="reply-bell">
      <button aria-label={fresh ? '새 알림' : '알림'} aria-expanded={open} onClick={() => void toggle()}>
        <Bell size={18} />
        {fresh && <span className="nav-alert" />}
      </button>
      {open && (
        <div className="reply-panel" role="dialog" aria-label="알림">
          <strong>알림</strong>
          {error ? (
            <p className="reply-empty">{error}</p>
          ) : replies === null ? (
            <p className="reply-empty">불러오는 중…</p>
          ) : replies.length === 0 ? (
            <p className="reply-empty">아직 알림이 없어요.</p>
          ) : (
            <ul>
              {replies.map((reply) => (
                <li key={reply.id} className={reply.created_at > seenBefore ? 'unread' : undefined}>
                  <a href={reply.kind === 'signup' ? '/admin/members?status=pending' : `/posts/${reply.post_id}`}>
                    <small>
                      {replyKinds[reply.kind]} · {reply.author_name} · {formatWhen(reply.created_at)}
                    </small>
                    <span>{reply.excerpt}</span>
                    <em>{reply.title}</em>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function AppShell({
  active,
  breadcrumb,
  identity,
  mainClassName,
  children,
}: {
  active: BoardId | 'admin' | 'help' | null;
  breadcrumb: ReactNode;
  identity: ShellIdentity;
  mainClassName?: string;
  children: ReactNode;
}) {
  const [mobileNav, setMobileNav] = useState(false);
  // Desktop users can fold the sidebar away; the choice is remembered in this browser.
  const [sidebarClosed, setSidebarClosed] = useState(false);
  useEffect(() => {
    // Read after hydration so the server-rendered page and the first client render agree.
    const timer = setTimeout(() => {
      try {
        setSidebarClosed(localStorage.getItem('micom:sidebar-closed') === '1');
      } catch {}
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  function toggleSidebar() {
    const next = !sidebarClosed;
    setSidebarClosed(next);
    try {
      localStorage.setItem('micom:sidebar-closed', next ? '1' : '0');
    } catch {}
  }
  const [leaving, setLeaving] = useState(false);
  const botDialog = useRef<HTMLDialogElement>(null);
  const newsUpdated =
    active !== 'news' && !!identity.userId && (identity.newsReviewedAt || 0) > seenAt('news', identity.userId);

  async function logout() {
    setLeaving(true);
    try {
      await api('/api/auth/session', {}, 'DELETE');
    } finally {
      window.location.assign('/');
    }
  }

  return (
    <div className={`app-shell ${sidebarClosed ? 'sidebar-closed' : ''}`}>
      <aside className={`sidebar ${mobileNav ? 'mobile-open' : ''}`}>
        <a className="brand" href="/" aria-label="미컴 라운지 홈">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="brand-logo" src="/logo.png" alt="" width={480} height={201} />
          <span>
            미컴<span className="brand-light">라운지</span>
          </span>
        </a>
        <div className="workspace">
          <span className="workspace-icon">
            <Users size={20} />
          </span>
          <div>
            학과 커뮤니티<small>함께 만드는 우리 공간</small>
          </div>
          <span className="online-dot" />
        </div>
        <p className="nav-caption">커뮤니티</p>
        <nav aria-label="주요 메뉴">
          {boards.map((board) => (
            <a
              key={board.id}
              href={board.href}
              aria-current={active === board.id ? 'page' : undefined}
              className={active === board.id ? 'nav-item active' : 'nav-item'}
            >
              <board.icon size={20} />
              {board.label}
              {active === board.id && <span className="nav-dot" />}
              {identity.admin && !!identity.waiting?.[board.id] && (
                <span className="nav-count" aria-label={`${deskStatus[board.id]?.[0]} ${identity.waiting[board.id]}건`}>
                  {identity.waiting[board.id]}
                </span>
              )}
              {board.id === 'news' && newsUpdated && (
                <span className="nav-alert" role="status" aria-label="새 검토 결과" />
              )}
            </a>
          ))}
        </nav>
        <p className="nav-caption">대여 신청</p>
        <nav aria-label="대여 신청 바로가기">
          {rentalLinks.map((link) => (
            <a
              key={link.label}
              className="nav-item"
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                // Computers cannot open the KakaoTalk app from a link, so offer a QR code for the phone instead.
                if (link.href !== MICOMBOT_URL || !window.matchMedia('(hover: hover) and (pointer: fine)').matches)
                  return;
                e.preventDefault();
                botDialog.current?.showModal();
              }}
            >
              <link.icon size={20} />
              {link.label}
              <ArrowUpRight size={16} className="nav-external" />
            </a>
          ))}
        </nav>
        <dialog
          ref={botDialog}
          className="post-dialog bot-dialog"
          aria-label="미컴봇 채팅 열기"
          onClick={(e) => {
            if (e.target === botDialog.current) botDialog.current?.close();
          }}
        >
          <div className="dialog-inner">
            <button className="dialog-close icon-button" aria-label="닫기" onClick={() => botDialog.current?.close()}>
              <X size={20} />
            </button>
            <h2>미컴봇 채팅 열기</h2>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/micombot-qr.svg" alt="미컴봇 카카오톡 채널 QR코드" width={200} height={200} />
            <p>휴대폰 카메라로 찍으면 카카오톡에서 바로 채팅이 열려요.</p>
            <a className="primary" href={MICOMBOT_URL} target="_blank" rel="noopener noreferrer">
              웹에서 채팅 열기 <ArrowUpRight size={16} />
            </a>
            <small>PC 카카오톡에서는 ‘경성대 미컴봇’을 검색해도 돼요.</small>
          </div>
        </dialog>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Sparkles size={19} />
            <strong>작은 이야기가 연결이 되는 곳</strong>
            <p>
              우리 학과의 소식과 관심사를
              <br />
              함께 나눠보세요.
            </p>
          </div>
          <a
            href="/help"
            aria-current={active === 'help' ? 'page' : undefined}
            className={`nav-item ${active === 'help' ? 'active' : ''}`}
          >
            <CircleHelp size={20} />
            도움말
          </a>
          {identity.admin && (
            <a
              href="/admin"
              aria-current={active === 'admin' ? 'page' : undefined}
              className={`nav-item ${active === 'admin' ? 'active' : ''}`}
            >
              <ShieldCheck size={20} />
              뉴스 승인
            </a>
          )}
          <div className="sidebar-footer">
            MICOM LOUNGE <span>© {new Date().getFullYear()}</span>
          </div>
        </div>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <div>
            <button
              className="icon-button sidebar-toggle"
              aria-label={sidebarClosed ? '메뉴 펼치기' : '메뉴 접기'}
              aria-expanded={!sidebarClosed}
              title={sidebarClosed ? '메뉴 펼치기' : '메뉴 접기'}
              onClick={toggleSidebar}
            >
              {sidebarClosed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
            </button>
            <button className="icon-button mobile-menu" aria-label="메뉴 열기" onClick={() => setMobileNav(!mobileNav)}>
              <Menu size={22} />
            </button>
            <span className="breadcrumb">{breadcrumb}</span>
          </div>
          <div className="account-actions">
            {!identity.loaded ? (
              <span className="account-name">계정 확인 중…</span>
            ) : identity.signedIn ? (
              <>
                <span className="account-name">{identity.displayName || identity.email}</span>
                {identity.userId && <ReplyBell userId={identity.userId} repliedAt={identity.repliedAt} />}
                <a href="/account" aria-label="계정 설정">
                  <Settings size={18} />
                </a>
                <button aria-label="로그아웃" disabled={leaving} onClick={() => void logout()}>
                  <LogOut size={18} />
                </button>
              </>
            ) : (
              <>
                <a href="/login">로그인</a>
                <a className="top-signup" href="/signup">
                  회원가입
                </a>
              </>
            )}
          </div>
        </header>
        <main className={mainClassName}>
          <SiteNotice />
          {children}
          <footer className="page-footer">
            <strong>미컴 라운지</strong>
            <span>서로를 존중하는 말이 좋은 커뮤니티를 만듭니다.</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
