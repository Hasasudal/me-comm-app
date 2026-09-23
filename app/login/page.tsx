import AuthFrame from '../auth/auth-frame';
import LoginForm from './login-form';
export const metadata = { title: '로그인 | 미컴 라운지' };

export default function LoginPage() {
  return (
    <AuthFrame
      eyebrow="WELCOME BACK"
      title="로그인"
      description="인증을 마친 경성대학교 계정으로 미컴 라운지를 이용하세요."
      footer={
        <>
          <span>처음 방문했나요?</span>
          <a href="/signup">회원가입</a>
        </>
      }
    >
      <LoginForm />
    </AuthFrame>
  );
}
