// A post left "open" past its deadline reads as closed; the stored status is untouched.
export function recruitmentState(
  status: 'open' | 'closed' | null | undefined,
  deadline: string | null | undefined,
  now = Date.now(),
) {
  const today = new Date(now).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
  if (deadline && deadline < today) return 'closed';
  return status || null;
}
