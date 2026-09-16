'use client';

import { getApps, initializeApp } from 'firebase/app';
import { browserLocalPersistence, getAuth, setPersistence, type Auth } from 'firebase/auth';

type FirebasePublicConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
};

let authPromise: Promise<Auth> | undefined;

export function firebaseAuth() {
  if (!authPromise) {
    authPromise = fetch('/api/auth/config', { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({})) as FirebasePublicConfig & { error?: string };
        if (!response.ok) throw new Error(body.error || '학교 계정 로그인이 아직 설정되지 않았습니다.');
        const app = getApps()[0] || initializeApp(body);
        const auth = getAuth(app);
        auth.languageCode = 'ko';
        await setPersistence(auth, browserLocalPersistence);
        return auth;
      })
      .catch((error) => {
        authPromise = undefined;
        throw error;
      });
  }
  return authPromise;
}

export function safeReturnTo(value: string | null) {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/';
}
