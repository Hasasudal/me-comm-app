'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api-client';
import { confirmDialog } from '../../confirm-dialog';

type Club = {
  id: string;
  name: string;
  status: 'pending' | 'active';
  requested_by_name: string | null;
  post_count: number;
};

// Club requests from members: approve or reject them, and rename or remove approved clubs.
export default function ClubManager() {
  const [clubs, setClubs] = useState<Club[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const openedOnce = useRef(false);
  const load = useCallback(async () => {
    try {
      const result = (await api<{ clubs: Club[] }>('/api/admin/clubs')).clubs;
      setClubs(result);
      // Auto-open only once, right after the first load, when something needs attention.
      if (!openedOnce.current) {
        openedOnce.current = true;
        if (detailsRef.current && result.some((club) => club.status === 'pending')) {
          detailsRef.current.open = true;
        }
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  async function run(action: Promise<unknown>) {
    setError('');
    setBusy(true);
    try {
      await action;
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function saveRename(club: Club) {
    const name = renaming?.name.trim();
    setRenaming(null);
    if (name && name !== club.name) void run(api(`/api/admin/clubs/${club.id}`, { name }, 'PATCH'));
  }
  async function remove(club: Club) {
    const verb = club.status === 'pending' ? '거절' : '삭제';
    const linked = club.status === 'active' && club.post_count > 0;
    if (linked) {
      setError(`‘${club.name}’ 동아리에 연결된 글이 ${club.post_count}개 있어요. 연결된 글이 있으면 삭제할 수 없어요.`);
      return;
    }
    if (await confirmDialog(`${club.name} 동아리를 ${verb}할까요?`, { ok: verb, danger: true }))
      void run(api(`/api/admin/clubs/${club.id}`, {}, 'DELETE'));
  }
  const pending = clubs?.filter((club) => club.status === 'pending').length ?? 0;
  return (
    <details className="member-audit" ref={detailsRef}>
      <summary>
        동아리 관리 <span>{pending ? `대기 ${pending}` : (clubs?.length ?? 0)}</span>
      </summary>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!clubs ? (
        <p className="member-audit-empty">불러오는 중…</p>
      ) : clubs.length === 0 ? (
        <p className="member-audit-empty">아직 신청된 동아리가 없습니다.</p>
      ) : (
        <ol className="club-list">
          {clubs.map((club) => (
            <li key={club.id}>
              {renaming?.id === club.id ? (
                <form
                  className="club-rename"
                  onSubmit={(event) => {
                    event.preventDefault();
                    saveRename(club);
                  }}
                >
                  <input
                    aria-label="새 동아리 이름"
                    autoFocus
                    maxLength={30}
                    value={renaming.name}
                    onChange={(event) => setRenaming({ id: club.id, name: event.target.value })}
                    onKeyDown={(event) => event.key === 'Escape' && setRenaming(null)}
                  />
                  <button className="restore-button" disabled={busy || !renaming.name.trim()}>
                    저장
                  </button>
                  <button type="button" className="rename-button" onClick={() => setRenaming(null)}>
                    취소
                  </button>
                </form>
              ) : (
              <>
              <span>
                <strong>{club.name}</strong>{' '}
                <small>
                  {club.status === 'pending'
                    ? `승인 대기 · 신청 ${club.requested_by_name || '알 수 없음'}`
                    : `글 ${club.post_count}개`}
                </small>
              </span>
              <span className="approve-actions">
                {club.status === 'pending' ? (
                  <button
                    className="restore-button"
                    disabled={busy}
                    onClick={() => void run(api(`/api/admin/clubs/${club.id}`, { status: 'active' }, 'PATCH'))}
                  >
                    승인
                  </button>
                ) : (
                  <button className="rename-button" disabled={busy} onClick={() => setRenaming({ id: club.id, name: club.name })}>
                    이름 변경
                  </button>
                )}
                <button className="suspend-button" disabled={busy} onClick={() => remove(club)}>
                  {club.status === 'pending' ? '거절' : '삭제'}
                </button>
              </span>
              </>
              )}
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}
