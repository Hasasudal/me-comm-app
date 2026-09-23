import AuthFrame from '../auth/auth-frame';
import SignupForm from './signup-form';
export const metadata = { title: '회원가입 | 미컴 라운지' };

export default function SignupPage() {
  return (
    <AuthFrame
      eyebrow="SCHOOL MEMBER"
      title="회원가입"
      description="경성대학교 이메일로 인증한 학과 구성원만 글을 읽고 쓸 수 있습니다."
      footer={
        <>
          <span>이미 계정이 있나요?</span>
          <a href="/login">로그인</a>
        </>
      }
    >
      <SignupForm />
    </AuthFrame>
  );
}
