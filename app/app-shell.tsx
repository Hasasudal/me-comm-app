'use client';

import { useState, type ReactNode } from 'react';
import {
  ArrowUpRight,
  CircleHelp,
  Layers3,
  LogOut,
  Menu,
  MessageSquare,
  Newspaper,
  Settings,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react';
import { api } from './api-client';

export type BoardId = 'all' | 'board' | 'qna' | 'news' | 'clubs' | 'contests';
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
    id: 'qna',
    label: '학사 Q&A',
    href: '/qna',
    icon: CircleHelp,
    sub: '수강신청, 졸업요건, 휴학처럼 학사 궁금증을 묻고 답해보세요.',
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
export const boardLabels = Object.fromEntries(boards.map((b) => [b.id, b.label])) as Record<BoardId, string>;
export const boardPaths = Object.fromEntries(boards.map((b) => [b.id, b.href])) as Record<BoardId, string>;

export type ShellIdentity = {
  loaded: boolean;
  signedIn: boolean;
  userId?: string;
  email?: string;
  displayName?: string;
  newsReviewedAt?: number | null;
};

// "Seen" is a per-browser convenience: the news tab records when the author last looked at review results.
const seenKey = (userId: string) => `micom:news-seen:${userId}`;
export function newsSeenAt(userId: string) {
  try {
    return Number(localStorage.getItem(seenKey(userId))) || 0;
  } catch {
    return 0;
  }
}
export function markNewsSeen(userId: string) {
  try {
    localStorage.setItem(seenKey(userId), String(Date.now()));
  } catch {}
}

export function AppShell({
  active,
  breadcrumb,
  identity,
  mainClassName,
  children,
}: {
  active: BoardId | 'admin' | null;
  breadcrumb: ReactNode;
  identity: ShellIdentity;
  mainClassName?: string;
  children: ReactNode;
}) {
  const [mobileNav, setMobileNav] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const newsUpdated =
    active !== 'news' && !!identity.userId && (identity.newsReviewedAt || 0) > newsSeenAt(identity.userId);

  async function logout() {
    setLeaving(true);
    try {
      await api('/api/auth/session', {}, 'DELETE');
    } finally {
      window.location.assign('/');
    }
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'mobile-open' : ''}`}>
        <a className="brand" href="/" aria-label="미컴 라운지 홈">
          <span className="brand-mark">
            m<span>·</span>
          </span>
          <span>
            미컴<span className="brand-light">라운지</span>
            <small>OUR CAMPUS, CONNECTED</small>
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
              {board.id === 'news' && newsUpdated && (
                <span className="nav-alert" role="status" aria-label="새 검토 결과" />
              )}
            </a>
          ))}
        </nav>
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
            href="/admin"
            aria-current={active === 'admin' ? 'page' : undefined}
            className={`nav-item ${active === 'admin' ? 'active' : ''}`}
          >
            <ShieldCheck size={20} />
            뉴스 승인
            <ArrowUpRight size={16} />
          </a>
          <div className="sidebar-footer">
            MICOM LOUNGE <span>© {new Date().getFullYear()}</span>
          </div>
        </div>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <div>
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
