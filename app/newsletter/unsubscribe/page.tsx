import AuthFrame from '../../auth/auth-frame';
import UnsubscribeButton from './unsubscribe-button';
export const metadata = { title: '뉴스레터 수신 거부 | 미컴 라운지' };

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const token = typeof params.token === 'string' ? params.token : '';
  return (
    <AuthFrame
      eyebrow="NEWSLETTER"
      title="뉴스레터 수신 거부"
      description="아래 버튼을 누르면 미컴 라운지 뉴스레터를 더 이상 보내지 않습니다. 로그인하지 않아도 됩니다."
      footer={<a href="/">라운지로 돌아가기</a>}
    >
      <UnsubscribeButton token={token} />
    </AuthFrame>
  );
}
