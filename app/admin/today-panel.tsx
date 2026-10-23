'use client';

import { useEffect, useState } from 'react';
import { api } from '../api-client';

type Summary = {
  news: number;
  members: number;
  inquiry: number;
  complaint: number;
  newsletter: { subject: string; scheduled_at: number } | null;
};
const when = (n: number) =>
  new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(n);

export default function TodayPanel({ onReview, refreshKey }: { onReview: () => void; refreshKey?: unknown }) {
  const [data, setData] = useState<Summary | null>(null);
  useEffect(() => {
    api<Summary>('/api/admin/summary')
      .then(setData)
      .catch(() => {});
  }, [refreshKey]);
  if (!data) return null;
  const items = [
    data.news > 0 && (
      <button key="news" type="button" onClick={onReview}>
        검토 대기 뉴스 <b>{data.news}</b>
      </button>
    ),
    data.members > 0 && (
      <a key="members" href="/admin/members?status=pending">
        가입 승인 대기 <b>{data.members}</b>
      </a>
    ),
    data.inquiry > 0 && (
      <a key="inquiry" href="/inquiry?waiting=1">
        답변 없는 학사문의 <b>{data.inquiry}</b>
      </a>
    ),
    data.complaint > 0 && (
      <a key="complaint" href="/complaint?waiting=1">
        답변 없는 학생회 건의 <b>{data.complaint}</b>
      </a>
    ),
  ].filter(Boolean);
  return (
    <section className="today-panel" aria-label="오늘 처리할 일">
      <h2>오늘 처리할 일</h2>
      {items.length ? <div className="today-items">{items}</div> : <p>모두 처리했어요.</p>}
      {data.newsletter && (
        <p className="today-next">
          예약된 뉴스레터 · {data.newsletter.subject} · {when(data.newsletter.scheduled_at)}
        </p>
      )}
    </section>
  );
}
