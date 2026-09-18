import AuthFrame from '../../auth/auth-frame';
import MemberManager from './member-manager';

export default function AdminMembersPage() {
  return (
    <AuthFrame
      eyebrow="MEMBER CONTROL"
      title="회원·직책 관리"
      description="회원을 검색해 직책(일반·학사·학생회·관리자)을 정하고 이용 상태를 관리합니다."
      footer={<a href="/admin">뉴스 승인으로 돌아가기</a>}
    >
      <MemberManager />
    </AuthFrame>
  );
}
