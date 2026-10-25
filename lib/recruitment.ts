// Deadlines are Korean dates, so "today" is the date in Seoul (YYYY-MM-DD).
export function seoulToday(now = Date.now()) {
  return new Date(now).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
}
// '2026-11-20' -> '11월 20일(금)', with the year only when it isn't this year (Seoul dates on both sides).
export function formatDeadline(deadline: string, now = Date.now()) {
  const date = new Date(`${deadline}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return deadline;
  const [year, month, day] = deadline.split('-').map(Number);
  const weekday = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', weekday: 'short' }).format(date);
  const prefix = String(year) === seoulToday(now).slice(0, 4) ? '' : `${year}년 `;
  return `${prefix}${month}월 ${day}일(${weekday.replace(/[()]/g, '')})`;
}
// A post left "open" past its deadline reads as closed; the stored status is untouched.
export function recruitmentState(
  status: 'open' | 'closed' | null | undefined,
  deadline: string | null | undefined,
  now = Date.now(),
) {
  if (deadline && deadline < seoulToday(now)) return 'closed';
  return status || null;
}
