import AuthFrame from '../auth/auth-frame';

export default function VerifyEmailPage() {
  return (
    <AuthFrame
      eyebrow="VERIFY EMAIL"
      title="학교 이메일을 확인해주세요"
      description="입력한 @ks.ac.kr 메일로 인증 링크를 보냈습니다. 링크를 누른 다음 로그인해주세요."
      footer={<><span>메일 인증을 마쳤나요?</span><a href="/login">로그인</a></>}
    >
      <div className="verify-panel">
        <strong>인증 메일이 보이지 않나요?</strong>
        <p>스팸 메일함을 확인하고, 몇 분 뒤에도 오지 않으면 로그인 화면에서 인증 메일을 다시 보낼 수 있습니다.</p>
        <a className="primary full" href="/login">로그인 화면으로 이동</a>
      </div>
    </AuthFrame>
  );
}
