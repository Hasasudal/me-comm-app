import AuthFrame from '../auth/auth-frame';
import VerifyTips from './verify-tips';

export default function VerifyEmailPage() {
  return (
    <AuthFrame
      eyebrow="VERIFY EMAIL"
      title="학교 이메일을 확인해주세요"
      description="입력한 @ks.ac.kr 메일로 인증 링크를 보냈습니다. 링크를 누른 다음 로그인해주세요."
      footer={
        <>
          <span>메일 인증을 마쳤나요?</span>
          <a href="/login">로그인</a>
        </>
      }
    >
      <VerifyTips />
    </AuthFrame>
  );
}
