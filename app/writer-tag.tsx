import { LockKeyhole } from 'lucide-react';

export type Writer = { name: string; email: string } | null;

// The account behind a nickname; the server sends it only to people allowed to see it.
export function WriterTag({ writer }: { writer?: Writer }) {
  if (writer === undefined) return null;
  return (
    <span className="writer-tag" title="관리자(문의·건의는 담당자)에게만 보입니다">
      <LockKeyhole size={11} aria-hidden="true" />
      {writer ? `${writer.name} · ${writer.email}` : '탈퇴했거나 알 수 없는 계정'}
    </span>
  );
}
