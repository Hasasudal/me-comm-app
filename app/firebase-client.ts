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
        const body = (await response.json().catch(() => ({}))) as FirebasePublicConfig & { error?: string };
        if (!response.ok) throw new Error(body.error || '로그인 기능이 아직 준비되지 않았어요. 운영진에게 알려주세요.');
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

// Only same-site paths. Browsers read "\" as "/" and drop tab/CR/LF, so "/\host" and "/\t/host" would leave the site:
// refuse control characters and backslashes outright, then let URL parsing decide whether the origin stays ours.
export function safeReturnTo(value: string | null) {
  if (!value?.startsWith('/') || /[\u0000-\u001F\u007F\\]/.test(value)) return '/';
  const origin = typeof location === 'undefined' ? 'https://return-to.invalid' : location.origin;
  try {
    const url = new URL(value, origin);
    return url.origin === origin ? url.pathname + url.search + url.hash : '/';
  } catch {
    return '/';
  }
}
