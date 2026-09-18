'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { ChevronRight, RotateCcw, Search, ShieldCheck, UserX } from 'lucide-react';
import { api } from '../../api-client';
import { AppShell, roleLabels, type Role, type ShellIdentity } from '../../app-shell';

type User = {
  id: string;
  email: string;
  display_name: string;
  status: 'active' | 'suspended';
  role: Role;
  created_at: number;
};
type Session = ShellIdentity & { admin?: boolean };
const roleHints: Record<Role, string> = {
  member: '일반 회원 권한만 갖습니다',
  academic: '학사문의를 모두 보고 답변합니다',
  council: '학생회 건의를 모두 보고 답변합니다',
  admin: '모든 기능과 직책 관리를 할 수 있습니다',
};
const roleOrder = Object.keys(roleLabels) as Role[];

export default function MemberManager() {
  const [identity, setIdentity] = useState<Session>({ loaded: false, signedIn: false });
  const [users, setUsers] = useState<User[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [role, setRole] = useState('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(
    async (nextPage = page) => {
      setBusy(true);
      setError('');
      try {
        const result = await api<{ users: User[]; total: number }>(
          `/api/admin/users?q=${encodeURIComponent(query)}&status=${status}&role=${role}&page=${nextPage}`,
        );
        setUsers(result.users);
        setTotal(result.total);
        setPage(nextPage);
      } catch (cause) {
        setError((cause as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [page, query, status, role],
  );
  useEffect(() => {
    api<Session>('/api/session')
      .then((session) => {
        setIdentity({ ...session, loaded: true });
        if (session.admin) return load(1);
      })
      .catch(() => setIdentity((value) => ({ ...value, loaded: true })));
    // Load once on entry; later searches go through the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function search(event: FormEvent) {
    event.preventDefault();
    await load(1);
  }
  async function update(user: User, change: { status?: User['status']; role?: Role }, question: string) {
    if (!window.confirm(question)) return;
    setBusy(true);
    setError('');
    try {
      await api(`/api/admin/users/${encodeURIComponent(user.id)}`, change, 'PATCH');
      await load(page);
    } catch (cause) {
      setError((cause as Error).message);
      setBusy(false);
    }
  }
  const toggleStatus = (user: User) =>
    user.status === 'active'
      ? update(
          user,
          { status: 'suspended' },
          `${user.display_name} 회원의 이용을 정지할까요?\n모든 기기에서 로그아웃됩니다.`,
        )
      : update(user, { status: 'active' }, `${user.display_name} 회원의 이용을 복구할까요?`);
  const assign = (user: User, next: Role) =>
    next !== user.role &&
    update(
      user,
      { role: next },
      `${user.display_name} 회원의 직책을 ‘${roleLabels[next]}’(으)로 바꿀까요?\n${roleHints[next]}.`,
    );

  return (
    <AppShell
      active="admin"
      identity={identity}
      breadcrumb={
        <>
          <a href="/admin">뉴스 승인</a> <ChevronRight size={14} /> <b>회원·직책 관리</b>
        </>
      }
    >
      <section className="page-heading">
        <div>
          <p className="eyebrow">MEMBER CONTROL</p>
          <h1>
            회원·직책 관리<span className="heading-dot">.</span>
          </h1>
          <p>회원을 찾아 직책(일반·학사·학생회·관리자)을 정하고 이용 상태를 관리합니다.</p>
        </div>
      </section>
      {!identity.loaded ? (
        <div className="loading" role="status">
          관리자 권한을 확인하고 있습니다…
        </div>
      ) : !identity.admin ? (
        <div className="admin-gate">
          <ShieldCheck size={32} />
          <h3>관리자 전용 공간입니다</h3>
          <p>관리자 직책이 필요합니다. 관리자에게 직책을 요청해주세요.</p>
        </div>
      ) : (
        <section className="member-panel">
          <form className="member-search" onSubmit={search}>
            <label className="member-query">
              <Search size={17} />
              <input
                aria-label="회원 검색"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                maxLength={100}
                placeholder="이름 또는 학교 이메일"
              />
            </label>
            <select aria-label="직책" value={role} onChange={(event) => setRole(event.target.value)}>
              <option value="all">전체 직책</option>
              {roleOrder.map((value) => (
                <option key={value} value={value}>
                  {roleLabels[value]}
                </option>
              ))}
            </select>
            <select aria-label="회원 상태" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="all">전체 상태</option>
              <option value="active">이용 중</option>
              <option value="suspended">정지</option>
            </select>
            <button className="primary" disabled={busy}>
              검색
            </button>
          </form>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <p className="member-count">
            총 {total}명 · 직책이 있는 회원이 위에 표시됩니다. 내 직책은 다른 관리자가 바꿀 수 있어요.
          </p>
          <ul className="managed-list">
            {users.map((user) => (
              <li key={user.id} className={user.status}>
                <div className="member-info">
                  <strong>
                    {user.display_name}
                    {user.role !== 'member' && (
                      <span className={`role-badge ${user.role}`}>{roleLabels[user.role]}</span>
                    )}
                    {user.status === 'suspended' && <span className="status-chip">이용 정지</span>}
                  </strong>
                  <span>{user.email}</span>
                </div>
                <select
                  className={`role-select ${user.role}`}
                  aria-label={`${user.display_name} 직책`}
                  value={user.role}
                  disabled={busy || user.id === identity.userId}
                  title={
                    user.id === identity.userId ? '내 직책은 다른 관리자가 바꿀 수 있습니다' : roleHints[user.role]
                  }
                  onChange={(event) => void assign(user, event.target.value as Role)}
                >
                  {roleOrder.map((value) => (
                    <option key={value} value={value}>
                      {roleLabels[value]}
                    </option>
                  ))}
                </select>
                <button
                  className={user.status === 'active' ? 'suspend-button' : 'restore-button'}
                  disabled={busy || user.id === identity.userId}
                  onClick={() => void toggleStatus(user)}
                >
                  {user.status === 'active' ? <UserX size={16} /> : <RotateCcw size={16} />}
                  {user.status === 'active' ? '정지' : '복구'}
                </button>
              </li>
            ))}
            {!busy && !users.length && <li className="empty-members">조건에 맞는 회원이 없습니다.</li>}
          </ul>
          <div className="member-pagination">
            <button className="secondary" disabled={busy || page <= 1} onClick={() => void load(page - 1)}>
              이전
            </button>
            <span>{page} 페이지</span>
            <button className="secondary" disabled={busy || page * 20 >= total} onClick={() => void load(page + 1)}>
              다음
            </button>
          </div>
        </section>
      )}
    </AppShell>
  );
}
