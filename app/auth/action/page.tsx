import AuthFrame from '../auth-frame';
import ActionHandler, { type ActionMode } from './action-handler';
export const metadata = { title: '이메일 확인 | 미컴 라운지' };

const modes = new Set<ActionMode>(['verifyEmail', 'resetPassword', 'recoverEmail']);

export default async function EmailActionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawMode = typeof params.mode === 'string' ? params.mode : '';
  const mode = modes.has(rawMode as ActionMode) ? (rawMode as ActionMode) : null;
  const oobCode = typeof params.oobCode === 'string' ? params.oobCode : '';
  const continueUrl = typeof params.continueUrl === 'string' ? params.continueUrl : '';
  const titles = {
    verifyEmail: ['EMAIL VERIFICATION', '이메일 인증', '학교 이메일 인증을 완료하고 있습니다.'],
    resetPassword: ['PASSWORD RESET', '비밀번호 재설정', '새 비밀번호를 안전하게 설정해주세요.'],
    recoverEmail: ['EMAIL RECOVERY', '이메일 복구', '계정 이메일 변경을 취소하고 있습니다.'],
  } as const;
  const copy = mode
    ? titles[mode]
    : ['INVALID REQUEST', '올바르지 않은 요청', '이메일 링크가 잘못되었거나 지원하지 않는 작업입니다.'];
  return (
    <AuthFrame
      eyebrow={copy[0]}
      title={copy[1]}
      description={copy[2]}
      footer={<a href="/login">로그인 화면으로 돌아가기</a>}
    >
      <ActionHandler mode={mode} oobCode={oobCode} continueUrl={continueUrl} />
    </AuthFrame>
  );
}
