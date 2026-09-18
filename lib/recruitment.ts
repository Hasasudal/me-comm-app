// Deadlines are Korean dates, so "today" is the date in Seoul (YYYY-MM-DD).
export function seoulToday(now = Date.now()) {
  return new Date(now).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
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
