export function firebaseMessage(error: unknown) {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  const messages: Record<string, string> = {
    'auth/email-already-in-use': '이미 가입된 이메일입니다. 로그인해주세요.',
    'auth/invalid-email': '학교 이메일 형식을 확인해주세요.',
    'auth/invalid-credential': '이메일 또는 비밀번호가 올바르지 않습니다.',
    'auth/user-disabled': '사용이 중지된 계정입니다. 관리자에게 문의해주세요.',
    'auth/weak-password': '비밀번호는 영문과 숫자를 포함해 8자 이상 입력해주세요.',
    'auth/too-many-requests': '요청이 많습니다. 잠시 후 다시 시도해주세요.',
    'auth/network-request-failed': '네트워크 연결을 확인해주세요.',
    'auth/requires-recent-login': '보안을 위해 로그아웃한 뒤 다시 로그인해주세요.',
  };
  if (messages[code]) return messages[code];
  return error instanceof Error && !code ? error.message : '요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.';
}

export function isSchoolEmail(email: string) {
  return /^[^@\s]+@ks\.ac\.kr$/i.test(email.trim());
}

export function normalizeSchoolEmail(value: string) {
  const email = value.trim().toLowerCase();
  return email.includes('@') ? email : `${email}@ks.ac.kr`;
}
