// Firebase sends verification and reset mail from this address; school spam filters sometimes quarantine it.
export const MAIL_SENDER = 'noreply@mecomm-project.firebaseapp.com';
const VERIFY_EMAIL_KEY = 'micom:verify-email';
export function rememberVerifyEmail(email: string) {
  try {
    sessionStorage.setItem(VERIFY_EMAIL_KEY, email);
  } catch {}
}
export function verifyEmail() {
  try {
    return sessionStorage.getItem(VERIFY_EMAIL_KEY) || '';
  } catch {
    return '';
  }
}

export function firebaseMessage(error: unknown) {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  const messages: Record<string, string> = {
    'auth/email-already-in-use':
      '이미 가입된 이메일이에요. 인증 메일을 못 받았다면 다시 가입하지 말고, 로그인한 뒤 ‘인증 메일 다시 보내기’를 눌러주세요.',
    'auth/invalid-email': '학교 이메일 형식을 다시 확인해주세요.',
    'auth/invalid-credential': '이메일 또는 비밀번호가 맞지 않아요. 다시 확인해주세요.',
    'auth/wrong-password': '비밀번호가 맞지 않아요. 다시 확인해주세요.',
    'auth/missing-password': '비밀번호를 입력해주세요.',
    'auth/user-disabled': '이용이 정지된 계정이에요. 학과 사무실이나 운영진에게 문의해주세요.',
    'auth/weak-password': '비밀번호는 영문과 숫자를 포함해 8자 이상 입력해주세요.',
    'auth/too-many-requests': '짧은 시간에 너무 많이 시도했어요. 잠시 후 다시 시도해주세요.',
    'auth/network-request-failed': '인터넷 연결이 불안정해요. 연결을 확인한 뒤 다시 시도해주세요.',
    'auth/requires-recent-login': '보안을 위해 다시 로그인이 필요해요. 로그아웃한 뒤 다시 로그인해주세요.',
  };
  if (messages[code]) return messages[code];
  return error instanceof Error && !code ? error.message : '요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요.';
}

export function isSchoolEmail(email: string) {
  return /^[^@\s]+@ks\.ac\.kr$/i.test(email.trim());
}

export function normalizeSchoolEmail(value: string) {
  const email = value.trim().toLowerCase();
  return email.includes('@') ? email : `${email}@ks.ac.kr`;
}
